from node:24-slim
RUN apt-get update && apt-get install -y openssl libssl3
WORKDIR /app

# Copy config files first for layer caching
COPY tsconfig.base.json .
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
RUN npm install
WORKDIR /app
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma@5.20.0 generate --schema apps/api/prisma/schema.prisma
COPY apps/api/src ./apps/api/src
WORKDIR /app/apps/api
RUN npm run build
WORKDIR /app/apps/api
RUN npm install --production
WORKDIR /app
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs
EXPOSE ${PORT:-8080}
ENV NODE_ENV=production
ENV SKIP_MIGRATIONS=true
ENV PORT=8080
CMD ["node", "dist/index.js"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-8080}/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"
