import type { Request, Response, NextFunction } from "express";
import Jwt from "jsonwebtoken";

export function authenticaAccessToken(req: Request, res: Response, next: NextFunction){
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if(!token){
        return res.status(401).json({error: 'Token não fornecido'});
    }

    Jwt.verify(token, process.env.JWT_SECRET_ACCESS as string, (err, user) => {
        if(err) return res.status(403).json({error: 'Token inválido'});
        (req as any).user = user;
        next();
    });

}