FROM node:20-alpine
WORKDIR /app

# Copy package + tsconfig into the same path as repo expects
COPY services/llm-gateway/package.json services/llm-gateway/tsconfig.json ./services/llm-gateway/

# Install deps
WORKDIR /app/services/llm-gateway
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 300000 \
 && npm install --no-audit --no-fund

# Copy code with original layout preserved
WORKDIR /app
COPY services/llm-gateway/src ./services/llm-gateway/src
COPY infra ./infra
COPY core ./core
COPY src ./src

# Build using the service tsconfig (paths now match)
WORKDIR /app/services/llm-gateway
RUN npm run build \
 && echo "=== dist tree ===" \
 && ls -R dist | head -n 120

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]