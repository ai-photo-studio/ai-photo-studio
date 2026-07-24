FROM node:24-slim AS builder
RUN apt-get update && apt-get install -y openssl libssl3

WORKDIR /build
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/

RUN cd apps/api && npm install --include=dev && npm install --include=dev sharp

COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma@5.20.0 generate --schema apps/api/prisma/schema.prisma

COPY apps/api/src ./apps/api/src
RUN cd apps/api && npx tsc -p tsconfig.json

# Production runtime image
FROM node:24-slim
RUN apt-get update && apt-get install -y openssl libssl3

WORKDIR /app
COPY --from=builder /build/apps/api/dist ./apps/api/dist
COPY --from=builder /build/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /build/apps/api/package.json ./apps/api/package.json
COPY --from=builder /build/package.json /app/package.json

RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs

EXPOSE ${PORT:-8080}
ENV NODE_ENV=production
ENV SKIP_MIGRATIONS=true
ENV PORT=8080
CMD ["node", "apps/api/dist/index.js"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-8080}/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"
