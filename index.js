require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

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