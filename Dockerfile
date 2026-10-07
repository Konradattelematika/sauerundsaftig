# Build-Stage: Astro-Static-Build mit pnpm
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime-Stage: Node-Server ohne npm-Abhängigkeiten (server/), liefert dist/ aus,
# routet nach Host, Login/Go-Live-Schranke, JSON-API. Daten unter /data (Coolify Persistent Storage).
FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
ENV PORT=3000 NODE_ENV=production SUS_DIST_DIR=/app/dist SUS_DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY deploy/entrypoint.sh /usr/local/bin/sus-entrypoint
RUN chmod 0755 /usr/local/bin/sus-entrypoint && mkdir -p /data && chown node:node /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/sus-entrypoint"]
