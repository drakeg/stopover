# Local testing image for Stopover's web app (production is GitHub Pages).
#   docker compose up            → dev server with hot reload, reachable on your LAN at :5173
#   docker compose --profile preview up preview → production build served at :4173
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev:lan"]

FROM deps AS build
COPY . .
RUN npm run build

FROM build AS preview
EXPOSE 4173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
