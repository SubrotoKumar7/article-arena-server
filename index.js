require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 5000;


const serviceAccount = require("./article-arena-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// middleware
app.use(express.json());
app.use(cors());

app.get('/', async(req, res)=> {
    res.send('article arena server is running');
})

const verifyToken = async(req, res, next)=> {
    const token = req.headers.authorization.split(" ")[1];
    
    if(!token){
        return res.status(401).send({message: "Unauthorized access"});
    }

    try {
        const decode = await admin.auth().verifyIdToken(token);
        req.decode_email = decode.email;
        next();
    } catch (error) {
        return res.status(401).send({message: "Unauthorized access"});
    }

}


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
        const contestCollections = database.collection('contest');

        // middleware inside db
        const verifyAdmin = async(req, res, next) => {
            const email = req.decode_email;
            const query = {email};
            const user = await usersCollections.findOne(query);
            const role = user.role;
            if(!user || role !== 'admin'){
                return res.status(403).send({message: "Forbidden access"});
            }
            next();
        }

        const verifyCreator = async(req, res, next) => {
            const email = req.decode_email;
            const query = {email};
            const user = await usersCollections.findOne(query);
            const role = user.role;
            if(!user || role !== 'creator'){
                return res.status(403).send({message: "Forbidden access"});
            }
            next();
        }


        // ? users related api
        app.get('/users', async(req, res)=> {
            const query = {};
            const cursor = usersCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/users/:email/role', async(req, res)=> {
            const email = req.params.email;
            const query = {email};
            const user = await usersCollections.findOne(query);
            res.send({role: user?.role || 'users'});
        })

        app.post('/users', async(req, res)=> {
            const userData = req.body;
            const {email} = userData;
            userData.createdAt = new Date();
            userData.role = "user";
            const userExits = await usersCollections.findOne({email});

            if(userExits){
                return res.json({message: "user already exits"})    
            }
            
            const result = await usersCollections.insertOne(userData);
            res.send(result);
        })

        app.patch('/users', verifyToken, verifyAdmin, async(req, res)=> {
            const {email, role} = req.body;
            const query = {email};
            const updateRole = {
                $set: {
                    role: role
                }
            }

            const result = await usersCollections.updateOne(query, updateRole);
            res.send(result);
        })


        // ? pending Contest
        app.get('/contest', async(req, res)=> {
            const query = {};
            const cursor = contestCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.post('/contest', async(req, res)=> {
            const contestInfo = req.body;
            contestInfo.status = "pending";
            contestInfo.createdAt = new Date();
            const result = await contestCollections.insertOne(contestInfo);
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