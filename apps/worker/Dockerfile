# Background worker image (Render, Railway, Fly.io or any container host).
# Build from the repository root:  docker build -f apps/worker/Dockerfile -t tdc-worker .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY apps/worker/package.json apps/worker/
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
RUN npm ci --workspace @tdc/worker --workspace @tdc/core --workspace @tdc/db --include-workspace-root
COPY packages packages
COPY apps/worker apps/worker
COPY tsconfig.base.json ./
RUN npm run generate -w @tdc/db && npm run build -w @tdc/worker

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
RUN npm prune --omit=dev --workspace @tdc/worker --workspace @tdc/core --workspace @tdc/db --include-workspace-root
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start the scheduler + job runner.
CMD ["sh", "-c", "cd packages/db && npx prisma migrate deploy && cd /app && exec node apps/worker/dist/index.js"]
