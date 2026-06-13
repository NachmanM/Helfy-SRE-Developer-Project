FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install express mysql2 log4js

COPY backend/api/ ./

EXPOSE 3000

CMD ["node", "main-app-layout.js"]