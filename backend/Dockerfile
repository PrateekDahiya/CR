FROM node:20-alpine

WORKDIR /app

# Phase 1: use npm install (works with/without lockfile; lockfile will be committed in Phase 1.1 for deterministic builds)
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
