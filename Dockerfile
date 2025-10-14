FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./

COPY prisma ./prisma/

RUN npm install --omit=dev

RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["npm", "start"]