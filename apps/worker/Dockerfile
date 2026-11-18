FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile --filter @cafeteria/worker
COPY . .
RUN pnpm --filter @cafeteria/worker build

FROM node:24-alpine AS production-dependencies
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --prod --ignore-scripts --frozen-lockfile --filter @cafeteria/worker

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=production-dependencies /workspace/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /workspace/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /workspace/apps/worker/dist ./apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]
