FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source (will be overwritten by volume mount in dev)
COPY . .

# Create public directory if it doesn't exist
RUN mkdir -p public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run in development mode (supports hot reload with volume mounts)
CMD ["npm", "run", "dev"]
