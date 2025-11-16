# Peliculon.es

Pequeña app que sugiere películas al azar usando TMDB.

Requisitos

- Node.js
- `TMDB_API_KEY` en `.env`

Instalación y ejecución

```bash
npm install
# crear .env con TMDB_API_KEY=tu_key
npm run dev
```

Uso

- Abre `http://localhost:4321` en tu navegador.
- Botón **Otra**: nueva sugerencia aleatoria.
- Botón **Anterior**: vuelve a la sugerencia previa (historial local).

API

- `GET /api/random` — devuelve JSON con la película seleccionada.

Ejemplo mínimo de `.env`

```
TMDB_API_KEY=tu_api_key_aqui
```

Notas

- Si `/api/random` devuelve error, comprueba que la clave en `.env` existe y reinicia el servidor.
