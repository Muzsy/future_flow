FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile && pnpm build

# One initial image for the three processes keeps workspace package resolution intact.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
COPY --from=build --chown=node:node /opt/corepack /opt/corepack
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER node
CMD ["pnpm", "--filter", "@future-flow/web", "start", "--hostname", "0.0.0.0", "--port", "3000"]
