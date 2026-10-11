# ─── Dockerfile — Nginx Load Balancer ────────────────────────────────────────
#
# Builds a minimal Nginx image that substitutes environment variables into
# nginx.conf.template before starting, so upstream addresses never need to
# be hardcoded in the image.
#
# Based on the official Nginx Alpine image (open-source, no Plus features).
# ──────────────────────────────────────────────────────────────────────────────

FROM nginx:1.27-alpine

# Remove the default config supplied by the base image.
RUN rm /etc/nginx/conf.d/default.conf /etc/nginx/nginx.conf 2>/dev/null || true

# Copy our template into the image.
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# envsubst is included in the Alpine base image (via gettext).
# At container start, substitute the four upstream variables into the
# template and write the resolved file to /etc/nginx/nginx.conf,
# then exec nginx in the foreground.
CMD ["/bin/sh", "-c", \
     "envsubst '${BACKEND_1_HOST}${BACKEND_1_PORT}${BACKEND_2_HOST}${BACKEND_2_PORT}' \
      < /etc/nginx/nginx.conf.template \
      > /etc/nginx/nginx.conf \
      && nginx -t \
      && exec nginx -g 'daemon off;'"]

EXPOSE 80

# Docker-level health check — polls the Nginx-internal /nginx-health endpoint.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/nginx-health || exit 1
