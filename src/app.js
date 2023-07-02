import dotenv from "dotenv";
import express, { json } from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import joi from 'joi';
import dayjs from "dayjs";
import "dayjs/locale/pt-br.js";
import {strict as assert} from "assert";
import { stripHtml } from "string-strip-html";

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

setInterval(async () => {
    const timeLimit = Date.now() - 10000;
    const usersInactive = await db.collection('participants').find({lastStatus: {$lte: timeLimit}}).toArray()

    for (const user of usersInactive){
        const newMessage  = {
            from: user.name,
            to: 'Todos',
            text: 'sai da sala...',
            type: 'status',
            time: dayjs().locale("pt").format("HH:mm:ss")
        }

        try{
            await db.collection('messages').insertOne(newMessage);
            await db.collection('participants').deleteOne({name: user.name})
        }catch(err){
            return
        }
    }
    }, 15000)

app.post('/participants', async (req, res) =>{
    let name  = req.body.name;

    const userSchema = joi.object({
        name: joi.string().required()
    });
    
    const validation = userSchema.validate({name});
    if(validation.error){
        return res.sendStatus(422);
    }
    name = stripHtml(name).result.trim();

    try{
        const userExist = await db.collection('participants').findOne({name: name});
        if(userExist) return res.sendStatus(409);
        
        await db.collection('participants').insertOne({name: name, lastStatus: Date.now()});

        const newMessage = {
            from: name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().locale("pt").format("HH:mm:ss")
        }

        await db.collection('messages').insertOne(newMessage);

        res.sendStatus(201);
    }catch(err){
        return res.sendStatus(500);
    }
});

app.get('/participants', async (req, res) => {
    try{
        const participants = await db.collection('participants').find().toArray();
        res.send(participants);
    }catch(err){
        res.sendStatus(500);
    }
    
});

app.post('/messages', async (req, res) => {
    let user = req.headers.user;
    let to = req.body.to;
    let text = req.body.text;
    let type = req.body.type;

    const userSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message', 'private_message').required(),
        from: joi.string().required()
    });

    const newMessage = {to, text, type, from: user};
    const validation = userSchema.validate(newMessage);

    if(validation.error){
        return res.sendStatus(422);
    }

    newMessage.from = stripHtml(user).result.trim();
    newMessage.to = stripHtml(to).result.trim();
    newMessage.text = stripHtml(text).result.trim();
    newMessage.type = stripHtml(type).result.trim();

    try{
        const userDB = await db.collection('participants').findOne({name: user})
        if(!userDB) return res.sendStatus(422);
      
        newMessage.time = dayjs().locale("pt").format("HH:mm:ss");
        await db.collection('messages').insertOne(newMessage);
    } catch(err){
        return res.sendStatus(500);
    }

    res.sendStatus(201);
});

app.get('/messages', async (req, res) =>{
    const user = stripHtml(req.headers.user).result.trim();
    let limit = stripHtml(req.query.limit).result.trim();


    const limitSchema = joi.object({
    limit: joi.number().integer().positive().allow()
    })

    const validation = limitSchema.validate({limit});

    if(validation.error){
        console.log(validation.error)
        return res.sendStatus(422);
    }

    limit = parseInt(limit)
    try{
        const messages = await db.collection('messages').find(
            {$or: [
                {from: user},
                {to: "Todos"},
                {to: user},
                {type: "message"}
            ]}).toArray();
    
        let messagesRes;
        if(limit !== undefined){
            messagesRes = messages.slice(-limit).reverse();
        }else{
            messagesRes = [...messages].reverse();
        }
        
        res.send(messagesRes);
    }catch(err){
        res.sendStatus(500);
    }
    
});

app.post('/status', async (req, res) =>{
    if(req.headers.user === undefined) return res.sendStatus(404);
    const user = stripHtml(req.headers.user).result.trim();

    try{
        const result = await db.collection('participants').updateOne(
            {name: user},
            {$set: {name: user, lastStatus: Date.now()}}
        );

        if(result.matchedCount === 0) return res.sendStatus(404);

        res.sendStatus(200)
    }catch(err){
        res.sendStatus(500);
    }
});

app.delete('/messages/:id', async (req, res) =>{
    if(req.headers.user === undefined || req.params.id === undefined) return res.sendStatus(422);
    const user = stripHtml(req.headers.user).result.trim();
    const id = stripHtml(req.params.id).result.trim();
    try{
        const message = await db.collection('messages').find({_id: new ObjectId(id)}).toArray();
        if(message.length === 0) return res.sendStatus(404);
        if(message[0].from !== user) return res.sendStatus(401);
        await db.collection('messages').deleteOne({_id: new ObjectId(id)});
        res.sendStatus(204)
    }catch(err){
        res.sendStatus(500);
    }
});

app.put('/messages/:id', async (req, res) =>{
    let user = req.headers.user;
    let to = req.body.to;
    let text = req.body.text;
    let type = req.body.type;
    const id = req.params.id;

    const userSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message', 'private_message').required(),
        from: joi.string().required()
    });

    const newMessage = {to, text, type, from: user};
    const validation = userSchema.validate(newMessage);

    if(validation.error){
        return res.sendStatus(422);
    }

    newMessage.from = stripHtml(user).result.trim();
    newMessage.to = stripHtml(to).result.trim();
    newMessage.text = stripHtml(text).result.trim();
    newMessage.type = stripHtml(type).result.trim();

    try{
        const message = await db.collection('messages').find({_id: new ObjectId(id)}).toArray();
        if(message.length === 0) return res.sendStatus(404);
        if(message[0].from !== user) return res.sendStatus(401);
        await db.collection('messages').updateOne({_id: new ObjectId(id)}, {$set: newMessage});
        res.sendStatus(204);
    }catch(err){
        res.sendStatus(500);
    }
});

app.listen(PORT, ()=> console.log(`Servidor rondando na porta ${PORT}`));