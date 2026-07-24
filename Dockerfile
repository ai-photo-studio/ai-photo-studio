from node:24-slim
RUN apt-get update && apt-get install -y openssl libssl3
WORKDIR /app

# Copy workspace root config
COPY tsconfig.base.json package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json

# Install all dependencies (including devDependencies for TypeScript build)
WORKDIR /app/apps/api
RUN npm install --include=dev
WORKDIR /app

# Generate Prisma client
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma@5.20.0 generate --schema apps/api/prisma/schema.prisma

# Copy and build
COPY apps/api/src ./apps/api/src
RUN node apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json

# Prune to production dependencies
WORKDIR /app/apps/api
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
