FROM node:24-slim

WORKDIR /app

# Install from the lockfile first so Docker caches dependencies.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN chown -R node:node /app
USER node

EXPOSE 3100
CMD ["npm", "run", "dev"]
