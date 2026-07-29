# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build-web
COPY . .
RUN npm run build:node

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build-web /app/package.json /app/package-lock.json ./
COPY --from=build-web /app/node_modules ./node_modules
COPY --from=build-web /app/.next ./.next
COPY --from=build-web /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start:node", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server ./server
EXPOSE 8788
CMD ["node", "server/index.mjs"]
