# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

ARG BUILD_DATE
ENV BUILD_DATE=${BUILD_DATE}
ARG CAPROVER_GIT_COMMIT_SHA
RUN echo "Commit: $CAPROVER_GIT_COMMIT_SHA"

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check pointing to root or any existing route
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
