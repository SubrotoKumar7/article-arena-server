require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const app = express();
const stripe = require('stripe')(process.env.STRIPE_KEY);
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
        const paymentCollections = database.collection('payment');
        const participantCollections = database.collection('participant');
        const submittedContestCollections = database.collection('submitted_contest');
        const winnerCollections = database.collection('winner');

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

        app.patch('/update-user',verifyToken, async(req, res)=> {
            const email = req.decode_email;
            const userInfo = req.body;
            const query = {email};

            const updateInfo = {
                $set: {
                    ...userInfo
                }
            }
            
            const result = await usersCollections.updateOne(query, updateInfo);
            res.send(result);
        })


        // ? Contest related api
        app.get('/contest', verifyToken, verifyCreator, async(req, res)=> {
            const query = {};
            const cursor = contestCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/contest/:id', async(req, res)=> {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await contestCollections.findOne(query);
            res.send(result);
        })

        app.get('/my-contest', verifyToken, verifyCreator, async(req, res)=> {
            const email = req.decode_email;
            const contestStatus = req.query.status;
            let query;

            if(contestStatus === 'approved'){
                query = {creatorEmail: email, status: contestStatus};
            }else{
                query = {creatorEmail: email};
            }

            const cursor = contestCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/pending-contest', async(req, res)=> {
            const query = {status: "pending"};
            const cursor = contestCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        // popular contest
        app.get('/popular-contest', async(req, res)=> {
            const query = {status: "approved"};
            const participant = {participant: -1};
            const cursor = contestCollections.find(query).sort(participant).limit(6);
            const result = await cursor.toArray();
            res.send(result);
        })


        app.get('/all-contest', async (req, res) => {
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const query = { status: 'approved' };
            const contests = await contestCollections.find(query).skip(skip).limit(limit).toArray();
            const total = await contestCollections.countDocuments(query);

            res.send({contests, total, totalPages: Math.ceil(total / limit), currentPage: page});
        });



        app.post('/contest', async(req, res)=> {
            const contestInfo = req.body;
            contestInfo.status = "pending";
            contestInfo.createdAt = new Date();
            contestInfo.winnerDeclare = 'no';
            const result = await contestCollections.insertOne(contestInfo);
            res.send(result);
        })

        app.patch('/contest/:id', async(req, res)=> {
            const id = req.params.id;
            const info = req.body;
            const query = {_id: new ObjectId(id)};
            const options = {};
            const update = {
                $set: {
                    ...info
                }
            }
            const result = await contestCollections.updateOne(query, update, options);
            res.send(result);
        })

        app.delete('/contest/:id', async(req, res)=> {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await contestCollections.deleteOne(query);
            res.send(result);
        })

        // ? payment related api
        app.post('/create-checkout-session', async(req, res)=> {
            const paymentInfo = req.body;
            const {contestId, customerEmail} = paymentInfo;

            const query = {contestId, participantEmail: customerEmail};
            const alreadyJoined = await participantCollections.findOne(query);

            if(alreadyJoined){
                return res.send({message: "already joined this content"});
            };

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: paymentInfo.contestName,
                                images: [paymentInfo.contestImage],
                                description: paymentInfo.description
                            },
                            unit_amount: Number(paymentInfo.price) * 100
                        },
                        quantity: 1,
                    }
                ],
                mode: 'payment',
                metadata: {
                    contestId: paymentInfo.contestId,
                    contestName: paymentInfo.contestName
                },
                customer_email: paymentInfo.customerEmail,
                success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
            });
            res.send({url: session.url});
        })

        app.patch('/payment-success', async(req, res)=> {
            const sessionId = req.query.session_id;
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            const transactionId = session.payment_intent;
            const query = {transactionId};
            const exist = await paymentCollections.findOne(query);

            if(exist){
                return res.send({message: "Payment already exists"});
            }

            if (session.payment_status !== 'paid') {
                return res.send({ success: false, message: "Payment not completed" });
            }

            if(session.payment_status === 'paid'){
                const id = session.metadata.contestId;
                const findQuery = {_id: new ObjectId(id)};
                const update = {
                    $inc: {participant: 1}
                }
                const result = await contestCollections.updateOne(findQuery, update);

                // payment info
                const payment = {
                    transactionId : session.payment_intent,
                    contestId: session.metadata.contestId,
                    email: session.customer_email,
                    payAmount: session.amount_total / 100,
                    currency: session.currency,
                    contestName: session.metadata.contestName,
                    paymentAt: new Date()
                }
                const paymentResult = await paymentCollections.insertOne(payment);

                const userQuery = {email: session.customer_email};
                const userResult = await usersCollections.findOne(userQuery);

                // find contest data via id
                const contestQuery = {_id: new ObjectId(session.metadata.contestId)};
                const contestResult = await contestCollections.findOne(contestQuery);

                const participantInfo = {
                    contestId: session.metadata.contestId,
                    contestName: contestResult.contestName,
                    category: contestResult.category,
                    prizeMoney: contestResult.prizeMoney,
                    price: contestResult.price,
                    deadline: contestResult.deadline,
                    participantEmail: session.customer_email,
                    displayName: userResult.displayName,
                    photoURL: userResult.photoURL,
                    isSubmit: 'no'
                }

                const participantResult = await participantCollections.insertOne(participantInfo);

                return res.send(result);
            }
        })


        // ? participant related api
        app.get('/my-joined-contest', verifyToken, async(req, res)=> {
            const email = req.decode_email;
            const query = {participantEmail: email, isSubmit: "no"};
            const cursor = participantCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        // ? submitted task related api
        app.get('/submit-contest/:id', async(req, res)=> {
            const contestId = req.params.id;
            const query = {contestId: contestId};
            const cursor = submittedContestCollections.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.post('/submit-contest', async(req, res)=> {
            const submitTask = req.body;
            const query = {
                contestId: submitTask.contestId,
                participantEmail: submitTask.email
            };

            const update = {
                $set: {
                    isSubmit: 'yes'
                }
            }
            const contestResult = await participantCollections.updateOne(query, update);
            const result = await submittedContestCollections.insertOne(submitTask);
            res.send(result);
        })


        // ? winner related api
        app.get('/contest-winner/:id', async(req, res)=> {
            const id = req.params.id;
            const query = {contestId: id};
            const result = await winnerCollections.findOne(query);
            res.send(result);
        })

        app.get('/latest-winner', async(req, res)=> {
            const sort = {createdAt: -1};
            const cursor = winnerCollections.find().sort(sort).limit(1);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.post('/declare-winner', async(req, res)=> {
            const winnerInfo = req.body;
            winnerInfo.createdAt = new Date();
            const {contestId} = winnerInfo;

            const query = {contestId};
            const winnerExits = await winnerCollections.findOne(query);
            if(winnerExits){
                return res.send({message: 'Winner already declare'});
            };

            const updateWinner = {
                $set: {
                    winnerDeclare: 'yes'
                }
            }
            const updateResult = await submittedContestCollections.updateMany(query, updateWinner); 

            const result = await winnerCollections.insertOne(winnerInfo);
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