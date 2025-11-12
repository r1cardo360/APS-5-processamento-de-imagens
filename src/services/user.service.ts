import { prisma } from "../prisma.js";
import Jwt from "jsonwebtoken";
import { extractSIFTFeatures, compareSIFTTemplates, validateSIFTTemplate, type SIFTTemplate } from "../helpers/sift.helper.js";

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
            throw new Error('Email ou nickName já foram cadastrados');
        }

        console.log(`Tipo de dado de userrole recebido: ${typeof(data.userrole)}`);

        if (isNaN(userRoleNumber) || ![1, 2, 3].includes(userRoleNumber)) {
            throw new Error('Valor inválido para userrole. Use apenas 1, 2 ou 3.');
        }

        // 1. Extrai características SIFT da impressão digital
        console.log('[SIFT] Extraindo características da digital...');
        const siftTemplate = await extractSIFTFeatures(imageBuffer);
        
        // 2. Valida se o template tem qualidade suficiente
        if (!validateSIFTTemplate(siftTemplate, 50)) {
            throw new Error('A qualidade da imagem da digital é insuficiente. Capture uma imagem melhor com pelo menos 50 características detectáveis.');
        }
        
        console.log(`[SIFT] ${siftTemplate.num_features} características detectadas`);
        
        // 3. Armazena o template SIFT em JWT (criptografado)
        const templateToken = Jwt.sign(
            { 
                template: siftTemplate,
                algorithm: 'SIFT',
                version: '1.0'
            },
            process.env.JWT_TEMPLATE_SECRET || 'SECRET_DO_TEMPLATE_MUITO_SECRETA', 
            { expiresIn: '365d' }
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

        let storedTemplate: SIFTTemplate;
        try {
            const payload: any = Jwt.verify(
                storedTemplateToken, 
                process.env.JWT_TEMPLATE_SECRET || 'SECRET_DO_TEMPLATE_MUITO_SECRETA'
            );
            storedTemplate = payload.template;
            
            // Verifica se é um template SIFT
            if (payload.algorithm !== 'SIFT') {
                throw new Error('Template armazenado não é SIFT. Recadastramento necessário.');
            }
        } catch (error) {
            throw new Error('Template biométrico salvo inválido ou expirado. Contate o suporte.');
        }

        // Extrai características SIFT da digital fornecida no login
        console.log('[SIFT Login] Extraindo características da digital fornecida...');
        const loginTemplate = await extractSIFTFeatures(imageBuffer);
        
        // Valida o template de login
        if (!validateSIFTTemplate(loginTemplate, 30)) {
            throw new Error('A qualidade da imagem fornecida é insuficiente para autenticação.');
        }
        
        console.log(`[SIFT Login] ${loginTemplate.num_features} características detectadas`);
        
        // Compara os templates usando SIFT
        const comparison = await compareSIFTTemplates(storedTemplate, loginTemplate);
        
        console.log(`[SIFT Login] Similaridade: ${comparison.similarity.toFixed(4)}`);
        console.log(`[SIFT Login] Matches válidos: ${comparison.good_matches}/${comparison.total_matches}`);
        
        // Define threshold de similaridade
        const SIMILARITY_THRESHOLD = 0.30;
        const MIN_MATCHES = 15;
        
        if (comparison.similarity < SIMILARITY_THRESHOLD || comparison.good_matches < MIN_MATCHES) {
            console.log(`[SIFT Login] Autenticação NEGADA - Similarity: ${comparison.similarity.toFixed(4)}, Matches: ${comparison.good_matches}`);
            throw new Error('Digital não corresponde.');
        }

        console.log('[SIFT Login] Autenticação APROVADA ✓');

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
            refreshToken: refreshToken,
            biometricInfo: {
                algorithm: 'SIFT',
                similarity: comparison.similarity,
                matches: comparison.good_matches,
                features: loginTemplate.num_features
            }
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