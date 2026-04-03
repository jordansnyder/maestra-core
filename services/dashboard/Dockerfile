FROM node:20-alpine

# Install deps into /deps — outside the /app bind mount zone
WORKDIR /deps
COPY package.json package-lock.json* ./
RUN npm ci

WORKDIR /app

# Copy source (will be overwritten by volume mount in dev)
COPY . .

# Create public directory if it doesn't exist
RUN mkdir -p public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Point Node to the isolated node_modules
ENV NODE_PATH=/deps/node_modules
ENV PATH=/deps/node_modules/.bin:$PATH

CMD ["npm", "run", "dev"]
