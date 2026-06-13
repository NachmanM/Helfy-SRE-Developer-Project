FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install kafkajs log4js

COPY backend/kafka-consumers/ ./

EXPOSE 3000

CMD ["node", "cdc-consumer.js"]