FROM node:20.19.1-alpine AS dependencies
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

FROM node:20.19.1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
EXPOSE 3001
CMD ["sh", "-c", "node_modules/.bin/tsx src/db/migrate.ts && node_modules/.bin/tsx src/index.ts"]
