# Kereo Frontend

Kereo frontend is a Vite + React dashboard that talks to the backend API at `https://kereo.online/api` in production.

## Build-time environment

The production API URL is baked into the static build.

```env
VITE_API_URL=https://kereo.online/api
```

For local development you can also use:

```env
VITE_API_URL=/api
```

which works with the Vite proxy in [`vite.config.ts`](/home/mortada0t/Projects/kereo/kereo-frontend/vite.config.ts).

## Container deployment

The frontend ships as a static Nginx container:

- `Dockerfile` builds the Vite app and serves `dist/`
- `nginx.conf` enables SPA fallback with `try_files ... /index.html`
- `/assets/*` is cached aggressively
- `index.html` is kept non-cacheable
