import express from "express";
import { 
    createUser, 
    deleteUser, 
    getdataUser, 
    inativarUser, 
    login, 
    logout, 
    logoutAll, 
    refreshToken, 
    updateUser
} from "../controllers/user.controller.js";
import { authenticaAccessToken } from "../middlewares/middleware.js";
import { upload } from "../middlewares/upload.js";

const router = express.Router();

router.post('/users', upload.single('fingerprint'), createUser);
router.post('/users/login', upload.single('fingerprint'), login);

router.post('/users/refreshtoken', refreshToken);
router.post('/users/logout', logout);
router.post('/users/logoutAll', authenticaAccessToken, logoutAll);
router.get('/users/me', authenticaAccessToken, getdataUser);
router.patch('/users/me', authenticaAccessToken, updateUser);
router.patch('/users/me/:id', authenticaAccessToken, inativarUser);
router.delete('/users/me/:id', authenticaAccessToken, deleteUser);

export default router;