FROM node:23-slim
RUN apt-get update && apt-get install -y openssl libssl3

WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/tsconfig.json ./
COPY package.json package-lock.json tsconfig.base.json /app/

RUN npm install --include=dev

COPY apps/api/prisma ./prisma
RUN npx prisma@5.20.0 generate

COPY apps/api/src ./src
RUN npx tsc -p tsconfig.json

RUN npm install --production

RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs

ENV NODE_ENV=production
ENV SKIP_MIGRATIONS=true
ENV PORT=8080
ARG BUILD_SHA=unknown
ENV BUILD_SHA=$BUILD_SHA
EXPOSE 8080
CMD ["node", "--expose-gc", "dist/index.js"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-8080}/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"
