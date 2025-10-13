import { type Request, type Response } from "express";
import { userService } from "../services/user.service.js";

export async function createUser(req: Request, res: Response) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Imagem da digital não fornecida.' });
        }
        const response = await userService.createUser(req.body, req.file.buffer);
        return res.status(201).json({
            success: true,
            message: 'Usuário cadastrado com sucesso',
            data: response
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            message: 'Ouve um erro ao cadastrar',
            error: err.message
        });
    }
}

export async function login(req: Request, res: Response) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Imagem da digital não fornecida.' });
        }
        const response = await userService.loginUser(req.body, req.file.buffer);
        return res.status(200).json({
            success: true,
            message: 'Login efetuado com suceso',
            dados: response
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            message: 'Houve algum erro ao tentar login',
            error: err.message
        });
    }
}

export async function refreshToken(req: Request, res: Response){
    try{
        const response = await userService.refreshToken(req.body.refreshToken)
        return res.status(200).json({
            success: true,
            message: 'Refresh token Gerado com sucesso !',
            dados: response
        })
    }catch(err: any){
        return res.status(500).json({
            success: false,
            message: 'Não foi possivel obter refresh token',
            error: err.message,
        })
    }
}

export async function logout(req: Request, res: Response){
    try{
        const response = await userService.logout(req.body.refreshToken);
        return res.status(200).json({
            success: true, 
            message: 'Logout realizado com sucesso !', 
            data: response
        });
    }catch(err: any){
        return res.status(500).json({
            success: false,
            message: 'Não foi possivel realizar logout !',
            error: err.message
        })
    }
}

export async function logoutAll(req: Request, res: Response){
    try{
        // Nota: A forma de obter o userId pode precisar de ajuste dependendo de como
        // o middleware authenticaAccessToken anexa o usuário ao req.
        const userId = (req as any).user.userpk;
        const response = await userService.logoutAll(userId);
        return res.status(200).json({
            success: true,
            message: 'Usuário deslogado de todas as sessões',
            data: response
        });
    }catch(err: any){
        return res.status(500).json({
            success: false,
            message: 'Houve um erro ao tentar deslogar as sessões do usuário',
            error: err.message
        })
    }
}

export async function getdataUser(req: Request, res: Response){
    try{
        const userId = (req as any).user.userpk;
        const response = await userService.getDataUser(userId);
        return res.status(200).json({
            success: true,
            message: 'Dados do usuário',
            data: response
        })
    }catch(err: any){
        return res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do usuário',
            error: err.message
        })
    }
}

export async function updateUser(req: Request, res: Response){
    try{
        const userId = (req as any).user.userpk;
        const response = await userService.updateUser(userId, req.body);
        res.status(200).json({
            success: true,
            message: 'Usuário alterado com sucesso !',
            data: response
        });
    }catch(err: any){
        res.status(500).json({
            success: false,
            message: 'Erro o tentar alterar um usuário',
            error: err.message
        });
    }
}

export async function inativarUser(req: Request, res: Response){
    try{
        const id = Number(req.params.id);
        const response = await userService.inativarUser(id);
        return res.status(200).json({
            success: true,
            message: 'Usuário inativado com sucesso !',
            data: response
        });
    }catch(err: any){
        return res.status(500).json({
            success: false,
            message: 'Houve um erro ao tentar inativar o Usuário',
            error: err.message
        });
    }
}

export async function deleteUser(req: Request, res: Response){
    try{
        const id = Number(req.params.id);
        const response = await userService.deleteUser(id);
        return res.status(200).json({
            success: true,
            message: 'O usuário foi deletado com sucesso',
            data: response
        });
    }catch(err: any){
        return res.status(500).json({
            success: false,
            message: 'Houve um erro ao tentar deletar o Usuário',
            error: err.message
        });
    }
}