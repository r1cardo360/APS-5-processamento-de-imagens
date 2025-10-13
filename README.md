# API de Autenticação Biométrica com Processamento de Imagens

Esta é uma API RESTful desenvolvida em Node.js e TypeScript como parte de um projeto de APS (Atividade Prática Supervisionada). O sistema implementa um mecanismo de autenticação de usuários que substitui as senhas tradicionais pelo processamento de imagens de impressão digital.

## 🚀 Funcionalidades Principais

-   **Cadastro de Usuário com Biometria:** O usuário se cadastra com seus dados e uma imagem de sua digital.
-   **Login Biométrico:** A autenticação é realizada através do envio de uma nova imagem da digital para comparação.
-   **Processamento de Imagem:** A API utiliza a biblioteca **Sharp** para converter as imagens, gerar um histograma e criar um "template" biométrico que é armazenado de forma segura.
-   **Gerenciamento de Sessão com JWT:** Após o login, a API gera um Access Token e um Refresh Token para autenticação e autorização nas rotas protegidas.
-   **Controle de Acesso Baseado em Níveis (RBAC):** O sistema suporta diferentes níveis de usuário (ex: `ADM`, `GERENTE`, `COMUM`) que podem ser usados para proteger rotas específicas.
-   **Operações CRUD** para gerenciamento de usuários.

## 🛠️ Tecnologias Utilizadas

-   **Backend:** Node.js, Express.js
-   **Linguagem:** TypeScript
-   **Banco de Dados:** PostgreSQL (com Prisma ORM)
-   **Processamento de Imagem:** Sharp
-   **Autenticação:** JSON Web Token (JWT)
-   **Upload de Arquivos:** Multer

## ⚙️ Configuração do Ambiente

Siga os passos abaixo para configurar e rodar o projeto localmente.

### Pré-requisitos

-   [Node.js](https://nodejs.org/en/) (versão 18.x ou superior)
-   [NPM](https://www.npmjs.com/) ou [Yarn](https://yarnpkg.com/)
-   Uma instância de um banco de dados [PostgreSQL](https://www.postgresql.org/) rodando.

### Passos para Instalação

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git](https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git)
    cd SEU_REPOSITORIO
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo chamado `.env` na raiz do projeto, copie o conteúdo de `.env.example` (se houver) ou use o modelo abaixo e preencha com suas informações.

    ```env
    # Configuração do Banco de Dados (PostgreSQL)
    DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO"

    # Porta da Aplicação
    PORT=3000

    # Chaves Secretas para JWT (Gere chaves longas e seguras!)
    JWT_SECRET_ACCESS="SUA_CHAVE_SECRETA_PARA_ACCESS_TOKEN_AQUI"
    JWT_REFRESH_SECRET="SUA_OUTRA_CHAVE_SECRETA_PARA_REFRESH_TOKEN_AQUI"
    ```

4.  **Aplique as Migrações do Banco de Dados:**
    Este comando irá criar todas as tabelas necessárias no seu banco de dados com base no schema do Prisma.
    ```bash
    npx prisma migrate dev
    ```

5.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```
    O servidor estará rodando no endereço `http://localhost:3000` (ou na porta que você definiu).

## 📄 Documentação da API (Endpoints)

A seguir estão os principais endpoints e como enviar os dados. Para testar, use uma ferramenta como [ApiDog](https://apidog.com/), [Postman](https://www.postman.com/) ou [Insomnia](https://insomnia.rest/).

---

### 1. Cadastrar Novo Usuário

Cria um novo usuário no sistema a partir de seus dados e da imagem de sua digital.

-   **Endpoint:** `POST /api/users`
-   **Tipo do Body:** `multipart/form-data`

#### Payload (Campos)

| Chave (`Key`)  | Tipo (`Type`) | Obrigatório | Descrição                               |
| :------------- | :------------ | :---------- | :-------------------------------------- |
| `username`     | Text          | Sim         | Primeiro nome do usuário.               |
| `userlastname` | Text          | Sim         | Sobrenome do usuário.                   |
| `usernickname` | Text          | Sim         | Apelido único para o usuário.           |
| `useremail`    | Text          | Sim         | E-mail único do usuário.                |
| `fingerprint`  | **File** | Sim         | Arquivo de imagem da impressão digital. |

#### Exemplo de Resposta de Sucesso (`201 Created`)

```json
{
    "success": true,
    "message": "Usuário cadastrado com sucesso",
    "data": {
        "id": 1,
        "username": "Ricardo",
        "userlastname": "Silva",
        "usernickname": "ricsilva",
        "useremail": "ricardo.silva@email.com",
        "userisativo": true,
        "fingerprintTemplate": {
            "histogram": [ /* ... array de 256 números ... */ ]
        },
        "createdAt": "2025-10-13T18:00:00.000Z",
        "updatedAt": "2025-10-13T18:00:00.000Z"
    }
}
```

---

### 2. Realizar Login

Autentica um usuário comparando a imagem da digital enviada com o template armazenado.

-   **Endpoint:** `POST /api/users/login`
-   **Tipo do Body:** `multipart/form-data`

#### Payload (Campos)

| Chave (`Key`)  | Tipo (`Type`) | Obrigatório | Descrição                               |
| :------------- | :------------ | :---------- | :-------------------------------------- |
| `useremail`    | Text          | Sim         | E-mail do usuário para identificação.   |
| `fingerprint`  | **File** | Sim         | Arquivo de imagem da impressão digital. |

#### Exemplo de Resposta de Sucesso (`200 OK`)

```json
{
    "success": true,
    "message": "login efetuado com suceso",
    "dados": {
        "user": {
            "id": 1,
            "username": "Ricardo",
            "userlastname": "Silva",
            "usernickname": "ricsilva",
            "useremail": "ricardo.silva@email.com",
            "userisativo": true,
            "fingerprintTemplate": {
                "histogram": [ /* ... */ ]
            },
            "createdAt": "2025-10-13T18:00:00.000Z",
            "updatedAt": "2025-10-13T18:00:00.000Z"
        },
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
}
```

---

### 3. Exemplo de Rota Protegida

Para acessar rotas protegidas, você deve incluir o `accessToken` retornado no login no cabeçalho `Authorization`.

-   **Endpoint:** `GET /api/users/me`
-   **Autenticação:** `Bearer Token`

#### Cabeçalho (Header)

| Chave (`Key`)     | Valor (`Value`)                        |
| :---------------- | :------------------------------------- |
| `Authorization`   | `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI...` |

#### Exemplo de Resposta de Sucesso (`200 OK`)

```json
{
    "success": true,
    "message": "Dados do usuário",
    "data": {
        "id": 1,
        "username": "Ricardo",
        "userlastname": "Silva",
        "usernickname": "ricsilva",
        "useremail": "ricardo.silva@email.com"
    }
}
```