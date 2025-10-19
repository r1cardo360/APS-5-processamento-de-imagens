# =============================================
# ESTÁGIO 1: Builder - Constrói a aplicação
# =============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Instala todas as dependências (incluindo as de desenvolvimento)
COPY package*.json ./
RUN npm install

# Copia o resto do código
COPY . .

RUN npx prisma generate
RUN npm run build
# =============================================
# ESTÁGIO 2: Production - Roda a aplicação
# =============================================
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
EXPOSE 7787
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]