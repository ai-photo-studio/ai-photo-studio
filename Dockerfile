FROM node:24-slim
RUN apt-get update && apt-get install -y openssl libssl3
WORKDIR /app
RUN mkdir -p apps/api
RUN echo '{"name":"@studio/api","version":"0.1.0","private":true,"type":"commonjs","dependencies":{"@aws-sdk/client-s3":"^3.882.0","@aws-sdk/s3-request-presigner":"^3.882.0","@prisma/client":"^5.20.0","bullmq":"^5.10.4","dotenv":"^16.4.5","express":"^4.19.2","ioredis":"^5.4.1","jsonwebtoken":"^9.0.3","zod":"^3.23.8"}}' > apps/api/package.json
WORKDIR /app/apps/api
RUN npm install
WORKDIR /app
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma@5.20.0 generate --schema apps/api/prisma/schema.prisma
COPY apps/api/dist ./apps/api/dist
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
