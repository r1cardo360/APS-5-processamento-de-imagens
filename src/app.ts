import express from "express";
import dotenv from "dotenv";
import userRoutes from "./routes/user.routes.js";
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT

app.use(express.json());

app.use(cors({origin: ['http://127.0.0.1:5500']}));

app.use('/api', userRoutes);

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta: ${PORT}\nAcesso: http://127.0.0.1:${PORT}`);
});