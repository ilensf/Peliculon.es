import type { APIRoute } from 'astro';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

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
  const key = process.env.TMDB_API_KEY;
  console.info('[api/random] TMDB_API_KEY present?', !!key);
  if (!key) {
    console.error('[api/random] Missing TMDB_API_KEY env var');
    return new Response(JSON.stringify({ error: 'Missing TMDB_API_KEY environment variable. Ensure .env exists and restart the dev server.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ error: 'No se encontraron películas que cumplan los requisitos (calificación >= 8 y al menos 500 votos).' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
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

    const voteAvg = typeof movie.vote_average === 'number' ? Number(movie.vote_average.toFixed(2)) : movie.vote_average;

    const out = {
      id: movie.id,
      title: movie.title || movie.name,
      overview: movie.overview,
      poster_path: movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : null,
      release_date: movie.release_date || movie.first_air_date || null,
      vote_average: voteAvg,
    };

    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[api/random] Error:', err && err.message ? err.message : err);
    return new Response(JSON.stringify({ error: `Error al obtener datos de TMDB: ${String(err)}` }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
};
