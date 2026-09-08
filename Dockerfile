# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

ARG BUILD_DATE
ARG GIT_COMMIT
ARG GIT_BRANCH=main
ARG GIT_TAG
ARG CAPROVER_GIT_COMMIT_SHA

ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV GIT_TAG=${GIT_TAG}
ENV CAPROVER_GIT_COMMIT_SHA=${CAPROVER_GIT_COMMIT_SHA}

COPY package*.json ./
RUN npm ci

COPY . .
# .git is not in the Docker context; stamp version.json from build-args
# so Settings shows this image's commit instead of a stale committed file.
RUN node scripts/generate-version.js && npm run build

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
