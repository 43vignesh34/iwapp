# API container for Cloud Run. Build from the REPO ROOT (the monorepo is the build context):
#   docker build -f apps/api/Dockerfile -t iwapp-api .

# ---- 1. build: install everything, compile TypeScript, then cut a production-only copy -------
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@iwapp/api... --output-logs=errors-only
# Copies @iwapp/api with ONLY its production dependencies (workspace packages included, built)
# into /out. Dev tools, tests and the other apps don't end up in the image.
RUN pnpm deploy --legacy --filter=@iwapp/api --prod /out

# ---- 2. run: a small image with just Node and the deployed app -------------------------------
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
# Never run as root inside the container.
USER node
# Cloud Run sends traffic to $PORT (8080) and expects the app on all interfaces.
ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080
# OpenTelemetry is loaded before the app (see apps/api/package.json "start").
CMD ["node", "--import", "@opentelemetry/auto-instrumentations-node/register", "dist/server.js"]
