FROM node:20-alpine AS builder

WORKDIR /app

# Phase 1: use npm install (works with/without lockfile; lockfile will be committed in Phase 1.1 for deterministic builds)
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["npm", "start"]
