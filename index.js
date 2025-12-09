require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcrypt');
const app = express();
const port = process.env.PORT || 5000;
const saltRounds = 10;

// middleware
app.use(express.json());
app.use(cors());

app.get('/', async(req, res)=> {
    res.send('article arena server is running');
})


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@first-db.5h5o2p2.mongodb.net/?appName=first-db`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
    });

    async function run() {
    try {
        await client.connect();

        const database = client.db('article_arena');
        const usersCollections = database.collection('users');

        // ? users related api
        app.get('/users', async(req, res)=> {
            const query = {};
            const cursor = usersCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.post('/users', async(req, res)=> {
            const userData = req.body;
            const salted = await bcrypt.hash(userData.password, saltRounds);
            userData.password = salted;
            const result = await usersCollections.insertOne(userData);
            res.send(result);
        })


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(port, ()=> {
    console.log(`article arena app listing on port ${port}`);
})