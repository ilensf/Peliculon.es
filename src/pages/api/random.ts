import type { APIRoute } from 'astro';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const PROVIDER_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';

async function fetchJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TMDB fetch failed: ${res.status} - ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse TMDB JSON: ${String(err)} - body: ${text}`);
  }
}

export const GET: APIRoute = async () => {
  try {
    if (!process.env.TMDB_API_KEY) {
      const fs = await import('fs/promises');
      try {
        const envPath = process.cwd() + '/.env';
        const text = await fs.readFile(envPath, 'utf8');
        for (const rawLine of text.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const idx = line.indexOf('=');
          if (idx === -1) continue;
          const k = line.slice(0, idx).trim();
          let v = line.slice(idx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) process.env[k] = v;
        }
        console.info('[api/random] Loaded .env from disk');
      } catch (err) {}
    }
  } catch (e) {}

  const key = process.env.TMDB_API_KEY;
  console.info('[api/random] TMDB_API_KEY present?', !!key);
  if (!key) {
    console.error('[api/random] Missing TMDB_API_KEY env var');
    return new Response(JSON.stringify({ error: 'Missing TMDB_API_KEY environment variable. Ensure .env exists and restart the dev server.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
    });
  }

  try {
    const params = new URLSearchParams({
      sort_by: 'popularity.desc',
      include_adult: 'false',
      'vote_average.gte': '8',
      'vote_count.gte': '500',
      api_key: key,
      page: '1',
    });
    const discoverUrl = `${TMDB_BASE}/discover/movie?${params.toString()}`;
    console.info('[api/random] URL Discover:', discoverUrl);
    const first = await fetchJson(discoverUrl);
    const totalPages = Math.min(first.total_pages || 1, 500);
    const randomPage = Math.floor(Math.random() * totalPages) + 1;

    const pageParams = new URLSearchParams({
      sort_by: 'popularity.desc',
      include_adult: 'false',
      'vote_average.gte': '8',
      'vote_count.gte': '500',
      api_key: key,
      page: String(randomPage),
    });
    const pageUrl = `${TMDB_BASE}/discover/movie?${pageParams.toString()}`;
    console.info('[api/random] URL página:', pageUrl);
    const pageData = await fetchJson(pageUrl);
    const results = pageData.results || [];
    if (!results.length) {
      return new Response(JSON.stringify({ error: 'No se encontraron películas que cumplan los requisitos (calificación >= 8 y al menos 500 votos).' }), { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' } });
    }

    const movie = results[Math.floor(Math.random() * results.length)];

    try {
      const detailsUrl = `${TMDB_BASE}/movie/${movie.id}?api_key=${key}&language=es-ES`;
      console.info('[api/random] Movie details URL (es):', detailsUrl);
      const details = await fetchJson(detailsUrl);
      if (details) {
        movie.title = details.title || movie.title;
        movie.overview = details.overview || movie.overview;
      }
    } catch (e) {
      console.info('[api/random] No localized Spanish details for movie id', movie.id);
    }

    let review_author: string | null = null;
    let review_content: string | null = null;
    let english_reviews: Array<{ author: string | null; content: string | null }> = [];
    try {
      const reviewsEsUrl = `${TMDB_BASE}/movie/${movie.id}/reviews?api_key=${key}&language=es-ES&page=1`;
      console.info('[api/random] Movie reviews URL (es):', reviewsEsUrl);
      const reviewsEs = await fetchJson(reviewsEsUrl);
      const listEs = (reviewsEs && reviewsEs.results) ? reviewsEs.results : [];
      if (listEs.length) {
        const chosen = listEs[0];
        review_author = chosen.author || null;
        review_content = chosen.content || null;
        if (review_content && review_content.length > 800) review_content = review_content.slice(0, 800) + '…';
      } else {
        const reviewsEnUrl = `${TMDB_BASE}/movie/${movie.id}/reviews?api_key=${key}&language=en-US&page=1`;
        console.info('[api/random] Movie reviews URL (en):', reviewsEnUrl);
        const reviewsEn = await fetchJson(reviewsEnUrl);
        const listEn = (reviewsEn && reviewsEn.results) ? reviewsEn.results : [];
        if (listEn.length) {
          english_reviews = listEn.slice(0, 2).map((r: any) => ({ author: r.author || null, content: r.content ? (r.content.length > 800 ? r.content.slice(0, 800) + '…' : r.content) : null }));
        }
      }
    } catch (e) {
      console.info('[api/random] Could not fetch reviews for movie id', movie.id);
    }

    let watch_providers: Array<{ name: string | null; logo: string | null }> = [];
    try {
      const providerUrl = `${TMDB_BASE}/movie/${movie.id}/watch/providers?api_key=${key}`;
      console.info('[api/random] Watch providers URL:', providerUrl);
      const providerData = await fetchJson(providerUrl);
      if (providerData && providerData.results && providerData.results.ES && providerData.results.ES.flatrate && providerData.results.ES.flatrate.length > 0) {
        watch_providers = providerData.results.ES.flatrate.map((p: any) => ({
          name: p.provider_name || null,
          logo: p.logo_path ? `${PROVIDER_IMAGE_BASE}${p.logo_path}` : null,
        }));
      }
    } catch (e) {
      console.info('[api/random] Could not fetch watch providers for movie id', movie.id);
    }

    const voteAvg = typeof movie.vote_average === 'number' ? Number(movie.vote_average.toFixed(2)) : movie.vote_average;

    const out = {
      id: movie.id,
      title: movie.title || movie.name,
      overview: movie.overview,
      poster_path: movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : null,
      release_date: movie.release_date || movie.first_air_date || null,
      vote_average: voteAvg,
      review_author,
      review_content,
      english_reviews,
      watch_providers: watch_providers,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
    };
    return new Response(JSON.stringify(out), { headers });

  } catch (err: any) {
    console.error('[api/random] Error:', err && err.message ? err.message : err);
    return new Response(JSON.stringify({ error: `Error al obtener datos de TMDB: ${String(err)}` }), { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' } });
  }
};