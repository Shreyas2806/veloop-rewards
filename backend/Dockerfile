# ─── Dockerfile — VELoop Rewards Backend ─────────────────────────────────────
#
# Used by docker-compose.yml to build both backend-1 and backend-2 images.
# Both containers run the SAME image; the PORT env var distinguishes them.
#
# The start command (node server.js) and application entry point are unchanged.
# ──────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Install dependencies first (layer cached separately from source code)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Switch to non-root
USER app

# PORT is supplied at runtime via docker-compose environment
EXPOSE 5000

# Unchanged start command — same as production on Render
CMD ["node", "server.js"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT||5000) + '/api/health', r => process.exit(r.statusCode===200?0:1))"
