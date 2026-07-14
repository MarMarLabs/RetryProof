FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DEMO_MODEL_MODE=cached
ENV CODEX_REPAIR_MODE=cached
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json next.config.ts next-env.d.ts eslint.config.mjs ./
COPY src ./src
COPY fixtures ./fixtures
COPY database ./database
COPY scripts/migrate.mjs ./scripts/migrate.mjs
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 retryproof \
  && useradd --system --uid 1001 --gid retryproof retryproof
COPY --from=builder --chown=retryproof:retryproof /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=retryproof:retryproof /app/next.config.ts ./
COPY --from=builder --chown=retryproof:retryproof /app/node_modules ./node_modules
COPY --from=builder --chown=retryproof:retryproof /app/.next ./.next
COPY --from=builder --chown=retryproof:retryproof /app/database ./database
COPY --from=builder --chown=retryproof:retryproof /app/scripts/migrate.mjs ./scripts/migrate.mjs
USER retryproof
EXPOSE 3000
CMD ["npm", "run", "start:production"]
