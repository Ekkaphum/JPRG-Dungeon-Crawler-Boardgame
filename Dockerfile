# Monster Colosseum — web build, served as static files via nginx.
# The game is 100% client-side (no backend, no database — see docs/02-architecture.md),
# so the runtime image only needs a static file server.

# ---- deps + build ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# public/assets/*.webp are already generated from the source artwork (tools/build-assets.ts
# was run once against the sibling Card Picture/ and Boss Picture/ folders and the output
# committed) — the Docker build context is just this webgame/ directory, so it does not need
# access to those sibling folders at all.
COPY . .
RUN npm run build

# ---- runtime ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
# Use 127.0.0.1 explicitly — nginx only binds IPv4 (`listen 80;`), and busybox wget's bare
# "localhost" resolves to ::1 first inside this image, which nginx isn't listening on.
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
