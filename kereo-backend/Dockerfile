FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache git


ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "dist/main.js"]
