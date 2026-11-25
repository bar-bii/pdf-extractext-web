FROM nginx:1.27-alpine

# Estáticos sin build step.
COPY src/ /usr/share/nginx/html/

# Template procesado por el entrypoint oficial de nginx con envsubst.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Solo se sustituye API_UPSTREAM; el resto ($host, $uri, ...) son variables de nginx.
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
ENV API_UPSTREAM=http://app:8000

EXPOSE 80
