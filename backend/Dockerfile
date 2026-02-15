FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

RUN mkdir -p /app/data

ENV PORT=3001
ENV NODE_ENV=production

# Note: backend runs as root because it needs access to the Docker socket,
# host /proc, /sys, and other privileged mounts. The frontend runs as
# non-root (nginx user) since it only serves static files.

EXPOSE 3001

CMD ["node", "src/index.js"]
