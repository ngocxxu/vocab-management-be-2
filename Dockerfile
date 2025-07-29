# Stage 1: Build stage
FROM node:20-alpine as builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

USER node
WORKDIR /home/node

# Copy lockfile and package.json
COPY --chown=node:node pnpm-lock.yaml package.json ./

# Install dependencies with pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY --chown=node:node . .

# Build application
RUN pnpm prisma generate \
    && pnpm build \
    && pnpm prune --prod

# Stage 2: Production stage
FROM node:20-alpine

# Install pnpm in production
RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

USER node
WORKDIR /home/node

# Copy necessary files from builder
COPY --from=builder --chown=node:node /home/node/package.json ./
COPY --from=builder --chown=node:node /home/node/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /home/node/node_modules/ ./node_modules/
COPY --from=builder --chown=node:node /home/node/dist/ ./dist/
# COPY --from=builder --chown=node:node /home/node/prisma/ ./prisma/

CMD ["node", "dist/server.js"]