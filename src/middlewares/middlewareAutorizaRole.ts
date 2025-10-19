import type{ Request, Response, NextFunction } from "express";

export function authorizeRole(...allowedRoles: number[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    if (!allowedRoles.includes(user.userrole)) {
      return res.status(403).json({ error: "Acesso negado: permissão insuficiente" });
    }

    next();
  };
}
