# Build from the repository root so the image contains both folders:
#   docker build -f backend/Dockerfile -t amine-portfolio .
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY backend/server.js backend/package.json ./backend/
COPY frontend ./frontend

# The official image ships an unprivileged "node" user; don't run as root.
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
