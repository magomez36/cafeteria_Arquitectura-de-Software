FROM node:24-alpine
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile --filter @cafeteria/worker
COPY . .
RUN pnpm --filter @cafeteria/worker build
CMD ["node", "apps/worker/dist/main.js"]
