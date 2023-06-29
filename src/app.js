import dotenv from "dotenv";
import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import joi from 'joi';
import dayjs from "dayjs";
import "dayjs/locale/pt-br.js";

dotenv.config();

const PORT = 5000;
const app = express();

app.use(cors());
app.use(json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try{
    await mongoClient.connect();
    console.log('Conectado ao MongoDB');
}catch (err){
    console.log(err.message);
}

const db = mongoClient.db();

app.post('/participants', async (req, res) =>{
    const { name } = req.body;

    const userSchema = joi.object({
        name: joi.string().required()
    });
    
    const validation = userSchema.validate({name});
    if(validation.error){
        return res.sendStatus(422);
    }

    try{
        const userExist = await db.collection('participants').findOne({name: name});
        if(userExist) return res.sendStatus(409);
        
        db.collection('participants').insertOne({name: name, lastStatus: Date.now()});

        const newMessage = {
            from: name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().locale("pt").format("H:mm:ss")
        }

        db.collection('messages').insertOne(newMessage);

        res.sendStatus(201);
    }catch(err){
        return res.sendStatus(500);
    }
});

app.listen(PORT, ()=> console.log(`Servidor rondando na porta ${PORT}`));