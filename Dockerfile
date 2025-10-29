# Optimized Dockerfile for Railway deployment
# Target: <2 min build time (down from 5+ min)

FROM node:18-slim

# Install Playwright dependencies (cached layer)
RUN apt-get update && \
    npx playwright install-deps chromium && \
    rm -rf /var/lib/apt/lists/*

# Install Playwright Chromium browser (cached layer)
RUN npx playwright install chromium

# Set working directory
WORKDIR /app

# Copy package files (cached layer if unchanged)
COPY backend/package*.json ./

# Install Node dependencies (cached layer if package.json unchanged)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --only=production

# Copy application code
COPY backend/ ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start application
CMD ["node", "server.js"]
