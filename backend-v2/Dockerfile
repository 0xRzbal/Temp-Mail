FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p database logs uploads
EXPOSE 3000 2525
CMD ["node", "server.js"]
