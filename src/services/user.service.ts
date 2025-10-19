import { prisma } from "../prisma.js";
import Jwt from "jsonwebtoken";
import sharp from 'sharp';

// ===================================================================
//   FUNÇÕES AUXILIARES PARA PROCESSAMENTO E COMPARAÇÃO DE IMAGEM
// ===================================================================

/**
 * Gera um template biométrico (histograma) a partir de um buffer de imagem usando a biblioteca sharp.
 * @param imageBuffer O buffer do arquivo de imagem.
 * @returns Um objeto contendo o histograma da imagem em escala de cinza.
 */
async function generateFingerprintTemplate(imageBuffer: Buffer): Promise<{ histogram: number[] }> {
    try {
        // Converte a imagem para escala de cinza e extrai os dados brutos dos pixels
        const { data } = await sharp(imageBuffer)
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Cria um array de 256 posições, todas com valor 0
        const histogram = new Array(256).fill(0);

        for (const pixelValue of data) {
            histogram[pixelValue]++;
        }
        
        return { histogram };
    } catch (error) {
        console.error("Erro ao processar imagem com a sharp:", error);
        throw new Error("Não foi possível processar a imagem fornecida.");
    }
}

/**
 * Compara dois templates biométricos e retorna um score de similaridade (0 a 1).
 * @param templateA O primeiro template (ex: o salvo no banco).
 * @param templateB O segundo template (ex: o gerado no login).
 * @returns Um número entre 0 (totalmente diferente) e 1 (próximo de idêntico).
 */
function compareTemplates(templateA: any, templateB: any): number {
    const hist1 = templateA.histogram;
    const hist2 = templateB.histogram;

    if (!hist1 || !hist2 || hist1.length !== 256 || hist2.length !== 256) {
        return 0; // Retorna 0 se os histogramas forem inválidos
    }

    // Calcula a distância euclidiana entre os dois vetores de histograma
    let sumOfSquares = 0;
    for (let i = 0; i < hist1.length; i++) {
        sumOfSquares += Math.pow(hist1[i] - hist2[i], 2);
    }
    const distance = Math.sqrt(sumOfSquares);

    // Normaliza a distância para um "score" de similaridade.
    const similarityScore = 1 / (1 + distance);
    return similarityScore;
}


// ===================================================================
//   LÓGICA PRINCIPAL DO SERVICE
// ===================================================================

export const userService = {
    /**
     * Cadastra um novo usuário com base em seus dados e imagem de digital.
     */
    async createUser(
        data: {
            username: string,
            userlastname: string,
            usernickname: string,
            useremail: string,
            userrole: number
        }, 
        imageBuffer: Buffer
    ) {
        if (!imageBuffer) {
            throw new Error("Imagem da digital é obrigatória para o cadastro.");
        }

        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ useremail: data.useremail }, { usernickname: data.usernickname }] },
        });

        if (existingUser) {
            throw new Error('Email ou nickName ja foram cadastrados');
        }

        if (![1, 2, 3].includes(data.userrole)) {
            throw new Error('Valor inválido para userrole. Use apenas 1, 2 ou 3.');
          }

        // Gera o template biométrico a partir da imagem usando SHARP
        const fingerprintTemplate = await generateFingerprintTemplate(imageBuffer);

        const user = await prisma.user.create({
            data: {
                ...data,
                fingerprintTemplate: fingerprintTemplate, // Salva o template JSON no banco
                userisativo: true
            }
        });

        const { ...userWithoutSensitiveData } = user;
        return userWithoutSensitiveData;
    },

    /**
     * Realiza o login de um usuário comparando a imagem da digital.
     */
    async loginUser(
        data: { useremail?: string, usernickname?: string }, 
        imageBuffer: Buffer
    ) {
        if (!imageBuffer) {
            throw new Error("Imagem da digital é obrigatória para o login.");
        }
        if (!data.usernickname && !data.useremail) {
            throw new Error('Nickname ou e-mail obrigatórios');
        }

        const whereConditions = [];
        if (data.useremail) {
            whereConditions.push({ useremail: data.useremail });
        }
        if (data.usernickname) {
            whereConditions.push({ usernickname: data.usernickname });
        }

        const user = await prisma.user.findFirst({
            where: { OR: whereConditions }
        });

        if (!user) {
            throw new Error('O Usuário não foi cadastrado');
        }

        if (!user.userisativo) {
            throw new Error("Usuário inativo.");
        }

        const loginTemplate = await generateFingerprintTemplate(imageBuffer);
        const storedTemplate = user.fingerprintTemplate;

        const similarity = compareTemplates(storedTemplate, loginTemplate);
        
        const SIMILARITY_THRESHOLD = 0.95; // Limiar de confiança
        console.log(`[Login Attempt] Similarity Score: ${similarity}`);

        if (similarity < SIMILARITY_THRESHOLD) {
            throw new Error('Digital não corresponde.');
        }

        const acessToken = Jwt.sign(
            { userpk: user.id, usernickname: user.usernickname, userrole: user.userrole },
            process.env.JWT_SECRET_ACCESS!,
            { expiresIn: '25m' }
        );

        const refreshToken = Jwt.sign(
            { userpk: user.id },
            process.env.JWT_REFRESH_SECRET!,
            { expiresIn: '10d' }
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 10);

        await prisma.userSession.create({
            data: {
                userId: user.id,
                refreshtoken: refreshToken,
                expiresAt: expiresAt
            }
        });

        const { ...userWithoutSensitiveData } = user;

        return {
            user: userWithoutSensitiveData,
            accessToken: acessToken,
            refreshToken: refreshToken
        }
    },

    // =======================================================
    //   FUNÇÕES ADICIONAIS MANTIDAS DO SEU CÓDIGO ORIGINAL
    // =======================================================

    // Nota: Esta função de verificar usuário por token de email pode não ser mais
    // necessária neste fluxo, mas está mantida aqui.
    async verifyUser(token: string) {
        // Este campo 'tokenConfirmacao' não existe mais no schema, então esta função
        // precisaria ser adaptada ou removida.
        // const user = await prisma.user.findFirst({ where: { tokenConfirmacao: token } });
        // if (!user) {
        //   throw new Error("Token inválido ou expirado");
        // }
        // await prisma.user.update({
        //   where: { id: user.id },
        //   data: {
        //     userisativo: true,
        //   }
        // });
        return { message: "Função de verificação precisa ser adaptada." };
    },

    async refreshToken(refreshToken: string) {
        if (!refreshToken) {
            throw new Error('Token ausente');
        }

        try {
            const payload: any = Jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!);
            
            const session = await prisma.userSession.findUnique({
                where: { refreshtoken: refreshToken },
                include: { user: true }
            })

            if (!session || !session.user) {
                throw new Error('Sessão não encontrada ou inválida');
            }

            const newAccessToken = Jwt.sign(
                { userpk: session.user.id, usernickname: session.user.usernickname },
                process.env.JWT_SECRET_ACCESS!,
                { expiresIn: "25m" }
            );

            return {
                user: session.user.usernickname,
                accessToken: newAccessToken
            }

        } catch (err) {
            console.log(err);
            throw new Error('Refresh token inválido ou expirado');
        }
    },

    async logout(refreshToken: string) {
        if (!refreshToken) {
            throw new Error('O token é obrigatório');
        }
        await prisma.userSession.deleteMany({
            where: { refreshtoken: refreshToken }
        });
        return `Sessão encerrada com sucesso.`;
    },

    async getDataUser(userId: number) {
        if (!userId) {
            throw new Error('ID do usuário é obrigatório.');
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                userlastname: true,
                usernickname: true,
                useremail: true,
            }
        });

        if (!user) {
            throw new Error("Usuário não encontrado.");
        }

        return user;
    },

    async logoutAll(userId: number) {
        if (!userId) {
            throw new Error('ID do usuário é obrigatório.');
        }
        await prisma.userSession.deleteMany({
            where: { userId }
        });
        return 'Todas as sessões foram deslogadas !';
    },

    async updateUser(userId: number, data: any) {
        if (!userId) {
            throw new Error('É necessario informar o id para alterar um dado');
        }
        
        // Impede a alteração de campos sensíveis ou imutáveis
        const { userpk, usernickname, useremail, fingerprintTemplate, createdAt, updatedAt, ...updatedData } = data

        if (Object.keys(updatedData).length === 0) {
            throw new Error('Informe algum campo para ser alterado');
        }

        const updatedUser = prisma.user.update({
            where: { id: userId },
            data: updatedData
        });

        return updatedUser;
    },

    async inativarUser(id: number) {
        if (!id) {
            throw new Error('O id é Obrigatório');
        }
        const user = await prisma.user.update({
            where: { id: id },
            data: { userisativo: false }
        });
        return user;
    },

    async deleteUser(id: number) {
        if (!id) {
            throw new Error('O id é Obrigatório');
        }
        // Garante que todas as sessões sejam deletadas antes de deletar o usuário
        await prisma.userSession.deleteMany({ where: { userId: id } });
        
        const userDelete = await prisma.user.delete({
            where: { id: id }
        });
        return userDelete;
    }
}