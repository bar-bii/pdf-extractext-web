# pdf-extractext-web

Front end estático de **PDF Extractext**, separado del backend siguiendo los
principios de [12-Factor App](https://12factor.net/es/). nginx sirve los
estáticos y hace de reverse proxy de `/api/*` hacia la API, por lo que el
navegador siempre trabaja contra un único origen (sin CORS).

## Arquitectura

```
navegador ──► web (nginx :80) ──/api/*──► app (FastAPI :8000) ──► extractor
```

- Sin build step: ES Modules nativos.
- La URL del backend es configuración de entorno (`API_UPSTREAM`), nunca código.
- Contenedor sin estado y efímero.

## Estructura

```
src/
  index.html        markup
  styles.css        estilos
  api.js            cliente HTTP (sin DOM)
  ui.js             render (sin fetch)
  app.js            wiring de eventos
  main.js           entrypoint
tests/              Vitest + jsdom
nginx.conf.template configuración de nginx (envsubst)
Dockerfile
```

## Desarrollo

Requiere Node.js 24+.

```bash
npm ci
npm run test:watch
```

Los tests cubren el cliente HTTP, la capa de UI, el wiring y el template de
nginx. Ver `AGENTS.md` para las reglas de TDD y diseño.

### Ejecutar localmente

El front necesita la API detrás de `/api`. Con la imagen de nginx:

```bash
docker build -t pdf-extractext-web .
docker run --rm -p 8080:80 \
  -e API_UPSTREAM=http://host.docker.internal:8000 \
  pdf-extractext-web
```

Abrí <http://localhost:8080>.

## Configuración

| Variable | Default | Descripción |
| --- | --- | --- |
| `API_UPSTREAM` | `http://app:8000` | URL interna de la API. nginx reenvía `/api/*` ahí. |

`NGINX_ENVSUBST_FILTER=API_UPSTREAM` limita la sustitución para no romper las
variables propias de nginx (`$host`, `$uri`, etc.).

## Integración con el backend

En el repo del backend, `docker-compose.yml` levanta este front como servicio
`web` y publica el puerto 80:

```yaml
web:
  build:
    context: https://github.com/bar-bii/pdf-extractext-web.git#<commit>
  ports:
    - "8000:80"
  environment:
    API_UPSTREAM: http://app:8000
```

El contrato de la API es:

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del backend |
| `POST` | `/api/extract` | Subir PDF (multipart `file`) |
| `GET` | `/api/documents` | Listar documentos |
| `GET` | `/api/documents/{id}` | Obtener documento |
| `PATCH` | `/api/documents/{id}` | Actualizar texto |
| `DELETE` | `/api/documents/{id}` | Borrar documento |

`/api/docs` expone Swagger UI del backend.

## Tests y CI

```bash
npm test
docker build -t pdf-extractext-web:ci .
docker run --rm -e API_UPSTREAM=http://127.0.0.1:8000 pdf-extractext-web:ci nginx -t
```

El workflow de GitHub Actions corre ambas validaciones en cada push y PR.
