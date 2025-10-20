FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

USER node
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
EXPOSE 3000
CMD ["node", "server.js"]

LABEL org.opencontainers.image.title="Vuzon"
LABEL org.opencontainers.image.description="UI para Cloudflare Email Routing"
LABEL org.opencontainers.image.url="https://vuzon.cc"
LABEL org.opencontainers.image.source="https://github.com/svnz0x/vuzon-docker"
LABEL org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"
