# Multi-stage Dockerfile for QuizMaster Pro
# Stage 1: Base image with dependencies
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Stage 2: Build stage (CSS bundling + cache busting)
FROM base AS builder
RUN npm ci
COPY . .
# Run production build: CSS bundling + cache busting
RUN npm run build:prod

# Stage 3: Production dependencies only
FROM base AS production-deps
RUN npm ci --only=production

# Stage 4: Final production image
FROM node:18-alpine AS production

# Install dumb-init
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies from production-deps stage
COPY --from=production-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code from builder (with cache-busted versions)
COPY --from=builder --chown=nodejs:nodejs /app/server.js ./
COPY --from=builder --chown=nodejs:nodejs /app/public ./public/
COPY --from=builder --chown=nodejs:nodejs /app/services ./services/

# Create directories for persistent data with proper permissions
RUN mkdir -p quizzes results public/uploads && \
    chown -R nodejs:nodejs quizzes results public/uploads

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
