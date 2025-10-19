import { prisma } from "../prisma.js";
import Jwt from "jsonwebtoken";
import sharp from 'sharp';

// ===================================================================
//   FUNÇÕES AUXILIARES PARA PROCESSAMENTO E COMPARAÇÃO DE IMAGEM
// ===================================================================

/**
 * Gera um template biométrico (histograma) a partir de um buffer de imagem usando a biblioteca sharp.
 * @param imageBuffer O buffer do arquivo de imagem.
 * @returns Um objeto contendo o histograma da imagem em escala de cinza (array de 256 posições).
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
 * Aplica uma limiarização (binarização) no histograma para criar um vetor compacto (apenas 0s e 1s).
 * @param histogram O array de histograma de 256 posições.
 * @param threshold O limite de contagem de pixels para definir 0 ou 1.
 * @returns Um array de 256 posições contendo apenas 0s e 1s.
 */
function createBinaryTemplate(histogram: number[], threshold: number = 500): number[] {
    // Retorna 1 se a contagem for maior que o threshold, 0 caso contrário.
    // O threshold (500) é um valor de exemplo e deve ser ajustado/otimizado.
    const binaryTemplate = histogram.map(count => (count > threshold ? 1 : 0));
    
    return binaryTemplate;
}


/**
 * Compara dois templates biométricos BINÁRIOS e retorna um score de similaridade (0 a 1).
 * Usa a contagem de "bits" correspondentes.
 * @param templateA O primeiro template binário (array de 0s e 1s).
 * @param templateB O segundo template binário (array de 0s e 1s).
 * @returns Um número entre 0 (totalmente diferente) e 1 (idêntico).
 */
function compareBinaryTemplates(templateA: number[], templateB: number[]): number {
    if (templateA.length !== templateB.length || templateA.length === 0) {
        return 0;
    }

    let matches = 0;
    for (let i = 0; i < templateA.length; i++) {
        // Conta quantos elementos (bits) são estritamente iguais
        if (templateA[i] === templateB[i]) {
            matches++;
        }
    }
    // Retorna a proporção de matches
    return matches / templateA.length; 
}


// ===================================================================
//   LÓGICA PRINCIPAL DO SERVICE
// ===================================================================

export const userService = {
    async createUser(
        data: {
            username: string,
            userlastname: string,
            usernickname: string,
            useremail: string,
            userrole: number | string
        }, 
        imageBuffer: Buffer
    ) {

        const userRoleNumber = Number(data.userrole);

        if (!imageBuffer) {
            throw new Error("Imagem da digital é obrigatória para o cadastro.");
        }

        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ useremail: data.useremail }, { usernickname: data.usernickname }] },
        });

        if (existingUser) {
            throw new Error('Email ou nickName ja foram cadastrados');
        }

        console.log(`Tipo de dado de userrole recebido: ${typeof(data.userrole)}`);

        if (isNaN(userRoleNumber) || ![1, 2, 3].includes(userRoleNumber)) {
            throw new Error('Valor inválido para userrole. Use apenas 1, 2 ou 3.');
        }

        // 1. Gera o template (histograma)
        const { histogram } = await generateFingerprintTemplate(imageBuffer);

        // 2. Limiariza/Binariza o template
        const binaryTemplate = createBinaryTemplate(histogram); 
        
        // 3. Gera o JWT contendo o template binarizado (Armazenamento ofuscado)
        const templateToken = Jwt.sign(
            { template: binaryTemplate },
            process.env.JWT_TEMPLATE_SECRET || 'SECRET_DO_TEMPLATE_MUITO_SECRETA', 
            { expiresIn: '365d' } // Tempo de vida longo para o template
        );

        const user = await prisma.user.create({
            data: {
                username: data.username,
                userlastname: data.userlastname,
                usernickname: data.usernickname,
                useremail: data.useremail,
                userrole: userRoleNumber,
                fingerprintTemplate: templateToken,
                userisativo: true
            }
        });

        const { ...userWithoutSensitiveData } = user;
        return userWithoutSensitiveData;
    },

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
        
        const storedTemplateToken = user.fingerprintTemplate as string;

        let storedBinaryTemplate: number[] = [];
        try {
            const payload: any = Jwt.verify(
                storedTemplateToken, 
                process.env.JWT_TEMPLATE_SECRET || 'SECRET_DO_TEMPLATE_MUITO_SECRETA'
            );
            storedBinaryTemplate = payload.template; 
        } catch (error) {
            throw new Error('Template biométrico salvo inválido ou expirado. Contate o suporte.');
        }


        const { histogram: loginHistogram } = await generateFingerprintTemplate(imageBuffer);
        const loginBinaryTemplate = createBinaryTemplate(loginHistogram); 
        
        const similarity = compareBinaryTemplates(storedBinaryTemplate, loginBinaryTemplate);
        
        const SIMILARITY_THRESHOLD = 0.85; // Ajuste o limiar de similaridade para templates binários (pode ser mais baixo que antes)
        console.log(`[Login Attempt] Binary Similarity Score: ${similarity}`);

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

    async verifyUser(token: string) {
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
                userrole: true
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
        
        const { userpk, usernickname, useremail, fingerprintTemplate, createdAt, updatedAt, ...updatedData } = data

        if (Object.keys(updatedData).length === 0) {
            throw new Error('Informe algum campo para ser alterado');
        }
        
        if (updatedData.userrole) {
            updatedData.userrole = Number(updatedData.userrole);
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
        await prisma.userSession.deleteMany({ where: { userId: id } });
        
        const userDelete = await prisma.user.delete({
            where: { id: id }
        });
        return userDelete;
    }
}