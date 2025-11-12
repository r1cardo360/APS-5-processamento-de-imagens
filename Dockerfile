# =============================================
# ESTÁGIO 1: Builder - Constrói a aplicação e o OpenCV
# =============================================
FROM node:20 AS builder

WORKDIR /app

# 1. Instalar as Dependências Nativas do OpenCV (em Debian/Ubuntu)
RUN apt-get update && \
    apt-get install -y \
        build-essential \
        cmake \
        git \
        libgtk2.0-dev \
        pkg-config \
        libavcodec-dev \
        libavformat-dev \
        libswscale-dev \
        libtbb2 \
        libtbb-dev \
        libjpeg-dev \
        libpng-dev \
        libtiff-dev \
    # Limpeza para otimização
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Instala todas as dependências (incluindo o opencv4nodejs)
COPY package*.json ./
# O 'npm install' agora instalará e compilará o opencv4nodejs
RUN npm install

# Copia o resto do código
COPY . .

RUN npx prisma generate
RUN npm run build

# =============================================
# ESTÁGIO 2: Production - Roda a aplicação
# =============================================
FROM node:20-slim

WORKDIR /app

# 1. Copiar binários e bibliotecas do opencv4nodejs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /usr/lib/x86_64-linux-gnu /usr/lib/x86_64-linux-gnu
RUN apt-get update && apt-get install -y libjpeg62-turbo libpng16-16 libtiff5 && apt-get clean && rm -rf /var/lib/apt/lists/*


# 2. Copiar o restante da aplicação
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 7787
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]