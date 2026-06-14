# VDI 数字工程师 Docker 镜像
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p workspaces pilotdeck-vdi/logs && chmod -R 755 /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "pilotdeck-vdi/mcp/vdi-knowledge/server-http.mjs"]
