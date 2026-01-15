FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "src/index.js"]
