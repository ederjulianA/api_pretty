# api_pretty en contenedor (migración al VPS de AkaSuite, fase 1).
# Se construye desde la raíz del repo: docker compose -f deploy/docker-compose.yml build
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    # puppeteer solo lo usa poc-catalogo-pdf/, que no corre dentro de la API
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
# authAudit (SEC-00) escribe en logs/
RUN mkdir -p logs && chown node:node logs

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
