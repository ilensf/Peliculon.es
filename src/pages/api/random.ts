import type { APIRoute } from 'astro';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const PROVIDER_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';
const REQUEST_TIMEOUT_MS = 8_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const MAX_CACHE_ENTRIES = 500;

interface Movie {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

interface DiscoverResponse {
  total_pages?: number;
  results?: Movie[];
}

interface DetailsResponse {
  title?: string;
  overview?: string;
}

interface ReviewsResponse {
  results?: Array<{
    author?: string;
    content?: string;
  }>;
}

interface ProvidersResponse {
  results?: {
    ES?: {
      flatrate?: Array<{
        provider_name?: string;
        logo_path?: string | null;
      }>;
    };
  };
}

interface CachedResponse {
  expiresAt: number;
  value: Promise<unknown>;
}

interface RateLimitEntry {
  resetAt: number;
  requestCount: number;
}

interface HandlerOptions {
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  timeoutMs?: number;
}

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function createTMDBRequest(
  fetchImpl: typeof fetch,
  apiKey: string,
  cache: Map<string, CachedResponse>,
  now: () => number,
  timeoutMs: number,
) {
  return async function fetchTMDB<T>(
    path: string,
    params: Record<string, string>,
    cacheDurationMs: number,
  ): Promise<T> {
    const url = new URL(`${TMDB_BASE}${path}`);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    url.searchParams.set('api_key', apiKey);

    const cacheKey = `${path}?${[...url.searchParams.entries()]
      .filter(([name]) => name !== 'api_key')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}=${value}`)
      .join('&')}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return (await cached.value) as T;
    }
    if (cached) cache.delete(cacheKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const value = (async () => {
      try {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`TMDB respondió con estado ${response.status}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('La solicitud a TMDB superó el tiempo máximo');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    })();

    cache.set(cacheKey, { expiresAt: now() + cacheDurationMs, value });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }

    try {
      return await value;
    } catch (error) {
      if (cache.get(cacheKey)?.value === value) cache.delete(cacheKey);
      throw error;
    }
  };
}

export function createRandomMovieHandler({
  apiKey,
  fetchImpl = fetch,
  now = Date.now,
  random = Math.random,
  timeoutMs = REQUEST_TIMEOUT_MS,
}: HandlerOptions) {
  const cache = new Map<string, CachedResponse>();
  const requestsByClient = new Map<string, RateLimitEntry>();

  return async function handleRandomMovie(clientAddress: string): Promise<Response> {
    if (!apiKey) {
      console.error('[api/random] Falta configurar TMDB_API_KEY');
      return jsonResponse({ error: 'El servicio de recomendaciones no está configurado.' }, 500);
    }

    const currentTime = now();
    const rateLimit = requestsByClient.get(clientAddress);
    if (rateLimit && rateLimit.resetAt > currentTime) {
      if (rateLimit.requestCount >= RATE_LIMIT_MAX_REQUESTS) {
        return jsonResponse(
          { error: 'Has solicitado demasiadas recomendaciones. Espera un minuto e inténtalo de nuevo.' },
          429,
        );
      }
      rateLimit.requestCount += 1;
    } else {
      requestsByClient.set(clientAddress, {
        resetAt: currentTime + RATE_LIMIT_WINDOW_MS,
        requestCount: 1,
      });
    }

    for (const [address, entry] of requestsByClient) {
      if (entry.resetAt <= currentTime) requestsByClient.delete(address);
    }

    const fetchTMDB = createTMDBRequest(fetchImpl, apiKey, cache, now, timeoutMs);
    try {
      const discoveryParams = {
        sort_by: 'popularity.desc',
        include_adult: 'false',
        'vote_average.gte': '8',
        'vote_count.gte': '500',
      };
      const firstPage = await fetchTMDB<DiscoverResponse>(
        '/discover/movie',
        { ...discoveryParams, page: '1' },
        5 * 60_000,
      );
      const totalPages = Math.min(Math.max(firstPage.total_pages ?? 1, 1), 500);
      const page = Math.floor(random() * totalPages) + 1;
      const pageData =
        page === 1
          ? firstPage
          : await fetchTMDB<DiscoverResponse>(
              '/discover/movie',
              { ...discoveryParams, page: String(page) },
              5 * 60_000,
            );
      const results = pageData.results ?? [];
      if (results.length === 0) {
        return jsonResponse(
          { error: 'No se encontraron películas que cumplan los requisitos de puntuación y votos.' },
          502,
        );
      }

      const movie = results[Math.floor(random() * results.length)];
      const movieId = String(movie.id);
      const [detailsResult, spanishReviewsResult, providersResult] = await Promise.allSettled([
        fetchTMDB<DetailsResponse>(
          `/movie/${movieId}`,
          { language: 'es-ES' },
          24 * 60 * 60_000,
        ),
        fetchTMDB<ReviewsResponse>(
          `/movie/${movieId}/reviews`,
          { language: 'es-ES', page: '1' },
          60 * 60_000,
        ),
        fetchTMDB<ProvidersResponse>(
          `/movie/${movieId}/watch/providers`,
          {},
          6 * 60 * 60_000,
        ),
      ]);

      const details =
        detailsResult.status === 'fulfilled' ? detailsResult.value : undefined;
      if (detailsResult.status === 'rejected') {
        console.warn('[api/random] No se pudieron obtener los detalles localizados');
      }

      const spanishReviews =
        spanishReviewsResult.status === 'fulfilled'
          ? spanishReviewsResult.value.results ?? []
          : [];
      if (spanishReviewsResult.status === 'rejected') {
        console.warn('[api/random] No se pudieron obtener reseñas en español');
      }

      let reviewAuthor: string | null = null;
      let reviewContent: string | null = null;
      let englishReviews: Array<{ author: string | null; content: string | null }> = [];
      const truncateReview = (content?: string): string | null => {
        if (!content) return null;
        return content.length > 800 ? `${content.slice(0, 800)}…` : content;
      };
      if (spanishReviews.length > 0) {
        reviewAuthor = spanishReviews[0].author || null;
        reviewContent = truncateReview(spanishReviews[0].content);
      } else {
        try {
          const englishReviewsResponse = await fetchTMDB<ReviewsResponse>(
            `/movie/${movieId}/reviews`,
            { language: 'en-US', page: '1' },
            60 * 60_000,
          );
          englishReviews = (englishReviewsResponse.results ?? []).slice(0, 2).map((review) => ({
            author: review.author || null,
            content: truncateReview(review.content),
          }));
        } catch {
          console.warn('[api/random] No se pudieron obtener reseñas en inglés');
        }
      }

      const providers =
        providersResult.status === 'fulfilled'
          ? providersResult.value.results?.ES?.flatrate ?? []
          : [];
      if (providersResult.status === 'rejected') {
        console.warn('[api/random] No se pudieron obtener plataformas disponibles');
      }

      return jsonResponse({
        id: movie.id,
        title: details?.title || movie.title || movie.name || 'Sin título',
        overview: details?.overview || movie.overview || '',
        poster_path: movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : null,
        release_date: movie.release_date || movie.first_air_date || null,
        vote_average:
          typeof movie.vote_average === 'number'
            ? Number(movie.vote_average.toFixed(2))
            : movie.vote_average,
        review_author: reviewAuthor,
        review_content: reviewContent,
        english_reviews: englishReviews,
        watch_providers: providers.map((provider) => ({
          name: provider.provider_name || null,
          logo: provider.logo_path ? `${PROVIDER_IMAGE_BASE}${provider.logo_path}` : null,
        })),
      });
    } catch (error) {
      console.error(
        '[api/random] Error al consultar TMDB:',
        error instanceof Error ? error.name : 'Error desconocido',
      );
      return jsonResponse(
        { error: 'No se pudo obtener una recomendación ahora. Inténtalo de nuevo.' },
        502,
      );
    }
  };
}

const handleRandomMovie = createRandomMovieHandler({
  apiKey: import.meta.env?.TMDB_API_KEY || process.env.TMDB_API_KEY,
});

export const GET: APIRoute = async ({ clientAddress }) => handleRandomMovie(clientAddress);
