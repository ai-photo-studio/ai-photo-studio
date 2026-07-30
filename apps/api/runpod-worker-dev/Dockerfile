FROM node:22-alpine
WORKDIR /worker
RUN addgroup -S worker && adduser -S worker -G worker
COPY package.json ./
RUN npm install --omit=dev
COPY worker.mjs ./
USER worker
ENTRYPOINT ["node", "worker.mjs"]
