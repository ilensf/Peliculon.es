# Peliculon.es

Peliculon.es ayuda a elegir una película cuando no sabes qué ver. Consulta The Movie Database (TMDB) y propone una película aleatoria con una puntuación mínima de 8/10 y al menos 500 votos.

## Requisitos

- Node.js `^20.19.0` o `>=22.12.0`
- pnpm
- Una clave de API de TMDB configurada como variable de entorno `TMDB_API_KEY`

## Instalación y ejecución

```bash
pnpm install
TMDB_API_KEY=tu_api_key pnpm dev
```

Para desarrollo local también puedes guardar `TMDB_API_KEY=tu_api_key` en un archivo `.env` en la raíz; Astro carga las variables de entorno automáticamente. En producción, configura la variable en el entorno de despliegue. La clave solo se usa en el servidor.

## Qué hace el sitio

- Al abrir la página, solicita y muestra una recomendación aleatoria de TMDB. La selección se basa en películas populares con puntuación de al menos 8/10 y un mínimo de 500 votos.
- Muestra el título, el póster, la fecha de estreno, la puntuación y la sinopsis disponible.
- Si TMDB dispone de ellos, permite desplegar una reseña en español o hasta dos reseñas en inglés. También muestra las plataformas de streaming con suscripción disponibles en España.
- **Otra película** carga una recomendación nueva. **Anterior** vuelve a las recomendaciones visitadas durante la sesión actual; si se pide otra película después de volver atrás, el historial posterior se reemplaza.
- Mientras carga una recomendación, el botón indica que está buscando y los controles de historial se desactivan. Los lectores de pantalla reciben avisos al comenzar la carga y al terminar; el foco permanece en el control que se estaba usando. Si falla la solicitud, el error también se muestra en la página y se anuncia.
- El enlace **Saltar al contenido principal** aparece al navegar con el teclado. Los botones de reseñas anuncian si su contenido está desplegado y los controles disponen de foco visible.

Las recomendaciones se obtienen mediante `GET /api/random`. Las páginas consultadas a TMDB y sus datos auxiliares se guardan temporalmente en caché en memoria del servidor. La ruta limita cada dirección IP a 30 solicitudes por minuto por instancia del servidor; en despliegues con varias instancias este límite no es global.

## Comprobaciones

```bash
pnpm check
pnpm test
pnpm build
```

## API

- `GET /api/random` — devuelve una recomendación en JSON. Requiere `TMDB_API_KEY` configurada en el servidor.
