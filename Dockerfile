# =============================================
# ESTÁGIO 1: Builder - Constrói a aplicação
# =============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências do sistema necessárias para OpenCV
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    cmake \
    openblas-dev \
    opencv-dev \
    opencv \
    libpng-dev \
    libjpeg-turbo-dev

# Copia arquivos de dependências
COPY package*.json ./

# Instala dependências do Node.js
RUN npm install

# Copia o resto do código
COPY . .

# Gera o Prisma Client e builda o projeto
RUN npx prisma generate
RUN npm run build

# =============================================
# ESTÁGIO 2: Production - Roda a aplicação
# =============================================
FROM node:20-alpine

WORKDIR /app

# Instala apenas as dependências de runtime do OpenCV
RUN apk add --no-cache \
    python3 \
    py3-pip \
    opencv \
    openblas \
    libpng \
    libjpeg-turbo

# Instala opencv-python para usar o SIFT
RUN pip3 install --no-cache-dir opencv-contrib-python numpy

# Copia os arquivos buildados do estágio anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Cria diretório para scripts Python
RUN mkdir -p /app/python-scripts

EXPOSE 7787

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]