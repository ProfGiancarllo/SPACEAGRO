# SpaceAgro: app + servidor da Estrela em um único container.
# As chaves de API NÃO entram na imagem: vêm das variáveis de ambiente da stack.

# ---------- build do app
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Endereço público da API da Estrela, gravado no app no momento do build
ARG VITE_ESTELA_URL=https://spaceagro.pro/api
# Modelo de previsão de produtividade (rota /forecast do mesmo servidor)
ARG VITE_FORECAST_URL=https://spaceagro.pro/api/forecast
# Opcional: preços de mercado (FRED) baixados no build; sem a chave o app usa os valores de exemplo
ARG FRED_API_KEY=
RUN if [ -n "$FRED_API_KEY" ]; then FRED_API_KEY="$FRED_API_KEY" node scripts/atualizar-mercado.mjs || echo "Sem dados de mercado agora."; fi
RUN VITE_ESTELA_URL="$VITE_ESTELA_URL" VITE_FORECAST_URL="$VITE_FORECAST_URL" npx vite build

# ---------- imagem final
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY server ./server
COPY worker/estela-worker.js ./worker/estela-worker.js
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server/server.mjs"]
