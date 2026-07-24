from node:24-slim
RUN apt-get update && apt-get install -y openssl libssl3
WORKDIR /app

# Copy all config files needed for installation
COPY tsconfig.base.json package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json

# Install dependencies (inside apps/api where package.json is)
WORKDIR /app/apps/api
RUN npm install --include=dev

# Generate Prisma client
COPY apps/api/prisma ./prisma
RUN npx prisma@5.20.0 generate

# Copy source and build
COPY apps/api/src ./src
RUN node node_modules/.bin/tsc -p tsconfig.json

# Prune to production dependencies only
RUN npm install --production

WORKDIR /app
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs
EXPOSE ${PORT:-8080}
ENV NODE_ENV=production
ENV SKIP_MIGRATIONS=true
ENV PORT=8080
CMD ["node", "apps/api/dist/index.js"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-8080}/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"
