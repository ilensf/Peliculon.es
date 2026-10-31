import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomMovieHandler } from './random';

const API_KEY = 'test-secret-key';

function createTMDBMock() {
  const requestedUrls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(input.toString());
    requestedUrls.push(url);

    if (url.pathname === '/3/discover/movie') {
      return Response.json({
        total_pages: 2,
        results: [
          {
            id: 100,
            title: 'Película de prueba',
            overview: 'Sinopsis breve',
            poster_path: '/poster.jpg',
            release_date: '2024-01-02',
            vote_average: 8.67,
          },
        ],
      });
    }
    if (url.pathname === '/3/movie/100') {
      return Response.json({ title: 'Título localizado', overview: 'Sinopsis en español' });
    }
    if (url.pathname === '/3/movie/100/reviews') {
      return Response.json({
        results: [{ author: 'Crítica', content: 'Una buena película.' }],
      });
    }
    if (url.pathname === '/3/movie/100/watch/providers') {
      return Response.json({
        results: {
          ES: {
            flatrate: [{ provider_name: 'Plataforma', logo_path: '/provider.png' }],
          },
        },
      });
    }
    throw new Error(`URL TMDB inesperada: ${url.pathname}`);
  };
  return { fetchImpl, requestedUrls };
}

test('devuelve una recomendación con datos localizados y plataformas de España', async () => {
  const { fetchImpl, requestedUrls } = createTMDBMock();
  const handler = createRandomMovieHandler({
    apiKey: API_KEY,
    fetchImpl,
    random: () => 0,
    now: () => 1_000,
  });

  const response = await handler('192.0.2.1');
  const movie = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(movie.title, 'Título localizado');
  assert.equal(movie.overview, 'Sinopsis en español');
  assert.equal(movie.poster_path, 'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.equal(movie.vote_average, 8.67);
  assert.deepEqual(movie.watch_providers, [
    { name: 'Plataforma', logo: 'https://image.tmdb.org/t/p/w92/provider.png' },
  ]);
  assert.equal(requestedUrls.length, 4);
  assert.ok(requestedUrls.every((url) => url.searchParams.get('api_key') === API_KEY));
  assert.ok(!JSON.stringify(movie).includes(API_KEY));
});

test('usa la caché temporal para evitar repetir consultas a TMDB', async () => {
  const { fetchImpl, requestedUrls } = createTMDBMock();
  const handler = createRandomMovieHandler({
    apiKey: API_KEY,
    fetchImpl,
    random: () => 0,
    now: () => 1_000,
  });

  await handler('192.0.2.2');
  await handler('192.0.2.2');

  assert.equal(requestedUrls.length, 4);
});

test('busca en una página aleatoria distinta de la primera cuando corresponde', async () => {
  const { fetchImpl, requestedUrls } = createTMDBMock();
  const randomValues = [0.75, 0];
  const handler = createRandomMovieHandler({
    apiKey: API_KEY,
    fetchImpl,
    random: () => randomValues.shift() ?? 0,
    now: () => 1_000,
  });

  await handler('192.0.2.3');

  assert.ok(
    requestedUrls.some(
      (url) =>
        url.pathname === '/3/discover/movie' && url.searchParams.get('page') === '2',
    ),
  );
});

test('responde con error de configuración sin revelar detalles internos', async () => {
  const handler = createRandomMovieHandler({ apiKey: undefined });
  const response = await handler('192.0.2.4');
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: 'El servicio de recomendaciones no está configurado.',
  });
});

test('cancela consultas a TMDB que superan el tiempo máximo', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error('La solicitud no tiene una señal de cancelación');
    return new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Solicitud cancelada', 'AbortError')),
        { once: true },
      );
    });
  };
  const handler = createRandomMovieHandler({
    apiKey: API_KEY,
    fetchImpl,
    timeoutMs: 1,
  });

  const response = await handler('192.0.2.6');
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(
    body.error,
    'No se pudo obtener una recomendación ahora. Inténtalo de nuevo.',
  );
  assert.ok(!JSON.stringify(body).includes(API_KEY));
});

test('limita a 30 solicitudes por minuto y dirección de cliente', async () => {
  const { fetchImpl } = createTMDBMock();
  const handler = createRandomMovieHandler({
    apiKey: API_KEY,
    fetchImpl,
    random: () => 0,
    now: () => 1_000,
  });

  for (let request = 0; request < 30; request += 1) {
    assert.equal((await handler('192.0.2.5')).status, 200);
  }

  const limitedResponse = await handler('192.0.2.5');
  assert.equal(limitedResponse.status, 429);
});
