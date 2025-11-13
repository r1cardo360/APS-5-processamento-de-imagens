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
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

# =============================================
# ESTÁGIO 2: Production - Roda a aplicação
# =============================================
FROM node:20-alpine

WORKDIR /app

# Instala apenas as dependências de runtime do OpenCV e Python
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-numpy \
    py3-opencv \
    opencv \
    openblas \
    libpng \
    libjpeg-turbo

# Copia os arquivos buildados do estágio anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Cria diretório para scripts Python e copia o script
RUN mkdir -p /app/python-scripts
COPY --from=builder /app/python-scripts ./python-scripts

# Torna o script Python executável
RUN chmod +x /app/python-scripts/sift_processor.py

EXPOSE 7787

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]