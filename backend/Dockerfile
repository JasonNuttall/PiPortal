FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

# Create data directory owned by node user
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV PORT=3001
ENV NODE_ENV=production

# Run as non-root user
USER node

EXPOSE 3001

CMD ["node", "src/index.js"]
