# syntax=docker/dockerfile:1

# --- Build: TypeScript -> dist ---
FROM node:22-alpine AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build

# --- Runtime: compiled JS only, no dev dependencies ---
FROM node:22-alpine AS runtime
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./dist

# The server reads migrations from /app/migrations and serves the five static
# files from /app, matching the repository layout it expects.
WORKDIR /app
COPY migrations ./migrations
COPY index.html download.html signin.html style.css script.js ./

# Run unprivileged. The data directory is only used if DATABASE_URL falls back
# to embedded Postgres.
RUN addgroup -S atlas \
  && adduser -S atlas -G atlas \
  && mkdir -p /app/server/data \
  && chown -R atlas:atlas /app
USER atlas

WORKDIR /app/server
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
