import express from 'express';
import cors from 'cors';
import { middleware } from './middleware';

const app = express();

app.use(express.json());
app.use(cors());

app.post("/buy", middleware, (req, res) => {
    res.json({
        message: "Hi there"
    })
})

app.post("/sell", middleware, (req, res) => {

})

app.post("/merge", middleware, (req, res) => {

})

app.post("/split", middleware, (req, res) => {

})

app.get("/balance", middleware, (req, res) => {

})

app.get("/positions", middleware, (req, res) => {

})

app.get("/history", middleware, (req, res) => {

})

app.listen(3000);