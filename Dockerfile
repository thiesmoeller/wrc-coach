# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build timestamp to invalidate cache
ARG BUILD_DATE
ENV BUILD_DATE=${BUILD_DATE}
ARG CAPROVER_GIT_COMMIT_SHA
RUN echo "Commit: $CAPROVER_GIT_COMMIT_SHA"

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html/

# Copy custom nginx configuration for PWA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
