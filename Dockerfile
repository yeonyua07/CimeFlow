FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:25-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV RELAY_PORT=3001
LABEL org.opencontainers.image.title="CimeFlow"
LABEL org.opencontainers.image.description="Open-source live participation console for ci.me streams"
LABEL org.opencontainers.image.licenses="MIT"

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/relay-server.js ./relay-server.js
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000 3001
USER node
CMD ["npm", "run", "start:ui"]
