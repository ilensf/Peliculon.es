interface Review {
  author: string | null;
  content: string | null;
}

interface WatchProvider {
  name: string | null;
  logo: string | null;
}

interface MovieRecommendation {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average?: number;
  review_author: string | null;
  review_content: string | null;
  english_reviews: Review[];
  watch_providers: WatchProvider[];
}

function isMovieRecommendation(value: unknown): value is MovieRecommendation {
  if (typeof value !== 'object' || value === null) return false;
  const movie = value as Partial<MovieRecommendation>;
  return (
    typeof movie.id === 'number' &&
    typeof movie.title === 'string' &&
    typeof movie.overview === 'string' &&
    (typeof movie.poster_path === 'string' || movie.poster_path === null) &&
    Array.isArray(movie.english_reviews) &&
    Array.isArray(movie.watch_providers)
  );
}

const FALLBACK_DESCRIPTION = 'Peliculon.es te ayuda a elegir una película para ver.';
const POSTER_PLACEHOLDER = 'Sin póster disponible';

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No se encontró el elemento #${id}`);
  return element as T;
}

function formatDate(value: string): string {
  const match = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES').format(date);
}

function updateMetadata(movie: MovieRecommendation): void {
  const description = movie.overview || FALLBACK_DESCRIPTION;
  document.title = `${movie.title} — Peliculon.es`;

  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', description);
  document
    .querySelector('meta[property="og:title"]')
    ?.setAttribute('content', document.title);
  document
    .querySelector('meta[property="og:description"]')
    ?.setAttribute('content', description);

  const image = movie.poster_path || '/assets/og-default.png';
  document
    .querySelector('meta[property="og:image"]')
    ?.setAttribute('content', new URL(image, window.location.origin).href);
  document
    .querySelector('meta[name="twitter:title"]')
    ?.setAttribute('content', document.title);
  document
    .querySelector('meta[name="twitter:description"]')
    ?.setAttribute('content', description);
  document
    .querySelector('meta[name="twitter:image"]')
    ?.setAttribute('content', new URL(image, window.location.origin).href);
  document
    .querySelector('meta[property="og:url"]')
    ?.setAttribute('content', window.location.href);
}

function createBadge(text: string, className = 'badge'): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = text;
  return badge;
}

function renderPoster(poster: HTMLElement, movie: MovieRecommendation): void {
  poster.replaceChildren();
  if (!movie.poster_path) {
    poster.textContent = POSTER_PLACEHOLDER;
    return;
  }

  const image = document.createElement('img');
  image.src = movie.poster_path;
  image.alt = `Póster de ${movie.title}`;
  image.loading = 'eager';
  image.decoding = 'async';
  poster.append(image);
}

function renderReviews(
  movie: MovieRecommendation,
  review: HTMLElement,
  englishReviews: HTMLElement,
  showReviewButton: HTMLButtonElement,
  showEnglishButton: HTMLButtonElement,
): void {
  review.replaceChildren();
  englishReviews.replaceChildren();
  review.hidden = true;
  englishReviews.hidden = true;
  showReviewButton.hidden = !movie.review_content;
  showEnglishButton.hidden = Boolean(movie.review_content) || movie.english_reviews.length === 0;
  showReviewButton.textContent = 'Mostrar reseña';
  showEnglishButton.textContent = 'Ver reseñas en inglés';
  showReviewButton.setAttribute('aria-expanded', 'false');
  showEnglishButton.setAttribute('aria-expanded', 'false');

  if (movie.review_content) {
    const content = document.createElement('div');
    content.className = 'review-content';
    content.textContent = `“${movie.review_content}”`;
    review.append(content);
    if (movie.review_author) {
      const author = document.createElement('div');
      author.className = 'review-author';
      author.textContent = `— ${movie.review_author}`;
      review.append(author);
    }
    return;
  }

  const noReview = document.createElement('div');
  noReview.className = 'small';
  noReview.textContent = 'No se encontraron reseñas en español.';
  review.append(noReview);
  review.hidden = false;

  movie.english_reviews.forEach((item, index) => {
    if (index > 0) {
      const separator = document.createElement('hr');
      separator.className = 'review-separator';
      englishReviews.append(separator);
    }
    const content = document.createElement('div');
    content.className = 'review-content';
    content.textContent = `“${item.content || ''}”`;
    englishReviews.append(content);
    if (item.author) {
      const author = document.createElement('div');
      author.className = 'review-author';
      author.textContent = `— ${item.author}`;
      englishReviews.append(author);
    }
  });
}

function renderProviders(container: HTMLElement, providers: WatchProvider[]): void {
  container.replaceChildren();
  if (providers.length === 0) {
    container.hidden = true;
    return;
  }

  const title = document.createElement('h3');
  title.className = 'providers-title';
  title.textContent = 'Disponible en España:';
  const list = document.createElement('ul');
  list.className = 'provider-list';

  for (const provider of providers) {
    if (!provider.logo) continue;
    const item = document.createElement('li');
    const image = document.createElement('img');
    image.src = provider.logo;
    image.alt = provider.name || 'Plataforma de streaming';
    image.title = provider.name || 'Plataforma de streaming';
    image.loading = 'lazy';
    image.decoding = 'async';
    item.append(image);
    list.append(item);
  }

  if (list.childElementCount === 0) {
    container.hidden = true;
    return;
  }

  container.append(title, list);
  container.hidden = false;
}

export function initMovieRecommendations(): void {
  const main = getElement<HTMLElement>('main');
  const poster = getElement<HTMLElement>('poster');
  const title = getElement<HTMLElement>('title');
  const overview = getElement<HTMLElement>('overview');
  const synopsisIntro = getElement<HTMLElement>('synopsisIntro');
  const review = getElement<HTMLElement>('review');
  const showReviewButton = getElement<HTMLButtonElement>('showReviewBtn');
  const showEnglishButton = getElement<HTMLButtonElement>('showEngBtn');
  const englishReviews = getElement<HTMLElement>('engReviews');
  const metadata = getElement<HTMLElement>('sub');
  const previousButton = getElement<HTMLButtonElement>('prevBtn');
  const anotherButton = getElement<HTMLButtonElement>('anotherBtn');
  const status = getElement<HTMLElement>('status');
  const providers = getElement<HTMLElement>('watchProviders');

  let history: MovieRecommendation[] = [];
  let historyIndex = -1;
  let isLoading = false;

  function updateHistoryControls(): void {
    previousButton.setAttribute(
      'aria-disabled',
      String(historyIndex <= 0 || isLoading),
    );
  }

  function render(movie: MovieRecommendation, announce = true): void {
    updateMetadata(movie);
    title.textContent = movie.title || 'Sin título';
    overview.textContent = movie.overview || 'Descripción no disponible.';
    synopsisIntro.hidden = !movie.overview;
    metadata.replaceChildren();

    if (movie.release_date) {
      const date = document.createElement('time');
      date.dateTime = movie.release_date;
      date.textContent = formatDate(movie.release_date);
      const dateBadge = createBadge('');
      dateBadge.replaceChildren(document.createTextNode('📅 '), date);
      metadata.append(dateBadge);
    }
    if (typeof movie.vote_average === 'number' && movie.vote_average > 0) {
      metadata.append(createBadge(`⭐ ${movie.vote_average.toFixed(1)}`, 'badge star'));
    }

    renderPoster(poster, movie);
    renderReviews(movie, review, englishReviews, showReviewButton, showEnglishButton);
    renderProviders(providers, movie.watch_providers || []);
    updateHistoryControls();

    if (announce) {
      const year = movie.release_date?.slice(0, 4);
      status.textContent = `Recomendación: ${movie.title}${year ? `, ${year}` : ''}. ${
        typeof movie.vote_average === 'number'
          ? `Puntuación: ${movie.vote_average.toFixed(1)} sobre 10.`
          : ''
      }`;
    }
  }

  async function fetchRandom(): Promise<void> {
    if (isLoading) return;
    isLoading = true;
    anotherButton.setAttribute('aria-disabled', 'true');
    anotherButton.setAttribute('aria-busy', 'true');
    anotherButton.textContent = 'Buscando película…';
    main.setAttribute('aria-busy', 'true');
    status.textContent = 'Cargando una recomendación de película…';
    updateHistoryControls();

    try {
      const response = await fetch('/api/random', {
        signal: AbortSignal.timeout(35_000),
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        const errorPayload = payload as { error?: string };
        throw new Error(
          errorPayload.error
            ? errorPayload.error
            : 'No se pudo obtener una recomendación ahora. Inténtalo de nuevo.',
        );
      }
      if (!isMovieRecommendation(payload)) {
        throw new Error('El servidor devolvió una recomendación con un formato no válido.');
      }

      if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
      }
      history.push(payload);
      historyIndex = history.length - 1;
      render(payload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo obtener una recomendación ahora. Inténtalo de nuevo.';
      title.textContent = 'No se pudo cargar la película';
      overview.textContent = message;
      synopsisIntro.hidden = true;
      poster.textContent = POSTER_PLACEHOLDER;
      metadata.replaceChildren();
      review.replaceChildren();
      review.hidden = true;
      englishReviews.replaceChildren();
      englishReviews.hidden = true;
      showReviewButton.hidden = true;
      showEnglishButton.hidden = true;
      showReviewButton.setAttribute('aria-expanded', 'false');
      showEnglishButton.setAttribute('aria-expanded', 'false');
      providers.replaceChildren();
      providers.hidden = true;
      status.textContent = `Error: ${message}`;
      console.error('[movie-recommendations] No se pudo cargar una película:', error);
    } finally {
      isLoading = false;
      main.setAttribute('aria-busy', 'false');
      anotherButton.removeAttribute('aria-disabled');
      anotherButton.removeAttribute('aria-busy');
      anotherButton.textContent = '🎬 Otra película';
      updateHistoryControls();
    }
  }

  previousButton.addEventListener('click', () => {
    if (isLoading) return;
    if (historyIndex > 0) {
      historyIndex -= 1;
      render(history[historyIndex]);
    }
  });
  anotherButton.addEventListener('click', () => void fetchRandom());

  showReviewButton.addEventListener('click', () => {
    review.hidden = !review.hidden;
    showReviewButton.textContent = review.hidden ? 'Mostrar reseña' : 'Ocultar reseña';
    showReviewButton.setAttribute('aria-expanded', String(!review.hidden));
  });
  showEnglishButton.addEventListener('click', () => {
    englishReviews.hidden = !englishReviews.hidden;
    showEnglishButton.textContent = englishReviews.hidden
      ? 'Ver reseñas en inglés'
      : 'Ocultar reseñas en inglés';
    showEnglishButton.setAttribute('aria-expanded', String(!englishReviews.hidden));
  });

  void fetchRandom();
}
