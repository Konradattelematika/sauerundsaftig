# Build-Stage: Abhängigkeiten installieren und die Site einmal mit dem Seed (Grundbestand) bauen.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN VIPS_CONCURRENCY=1 UV_THREADPOOL_SIZE=2 pnpm build \
 && node server/code-version.mjs > .code-version \
 && echo "Code-Version: $(cat .code-version)"

# Runtime-Stage: Node-Server (server/, nur node:* + sharp per dynamischem Import) liefert den aktuellen
# Build aus, routet nach Host, Login/Go-Live-Schranke, JSON-API und CMS (docs/CMS-PLAN.md §7).
# Das komplette App-Verzeichnis inkl. node_modules bleibt im Image: Beim Veröffentlichen baut der
# Server die Site zur Laufzeit neu (Astro-Build nach /data/builds/<id>/dist, danach Umschalten).
# Daten unter /data (Coolify Persistent Storage): CMS-Inhalte, Builds, Medien, Astro-Cache, Benutzer.
FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
ENV PORT=3000 NODE_ENV=production SUS_DIST_DIR=/app/dist SUS_DATA_DIR=/data SUS_APP_DIR=/app ASTRO_TELEMETRY_DISABLED=1
COPY --from=build /app /app
COPY deploy/entrypoint.sh /usr/local/bin/sus-entrypoint
# Schreibrechte für Builds zur Laufzeit (Benutzer node): Medien-Sync nach src/assets/media,
# Vite-Abhängigkeits-Cache (node_modules/.vite), .astro für generierte Typen. Der Rest bleibt root-eigen.
RUN chmod 0755 /usr/local/bin/sus-entrypoint \
 && mkdir -p /data /app/src/assets/media /app/.astro /app/node_modules/.vite \
 && chown node:node /data \
 && chown -R node:node /app/src/assets/media /app/.astro /app/node_modules/.vite
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/sus-entrypoint"]
