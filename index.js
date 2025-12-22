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

        app.get('/user-profile', verifyToken , async(req, res)=> {
            const email = req.decode_email;
            const query = {email};
            const result = await usersCollections.findOne(query);
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
                query = {creatorEmail: email, status: contestStatus, participant: {$gt: 0}, winnerDeclare: 'no'};
            }else{
                query = {creatorEmail: email};
            }

            const cursor = contestCollections.find(query).sort({createdAt: -1});
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
            const contests = await contestCollections.find(query).sort({createdAt: -1}).skip(skip).limit(limit).toArray();
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
        app.get('/winning-contest', verifyToken, async(req, res)=> {
            const email = req.decode_email;
            const query = {winnerEmail: email};
            const cursor = winnerCollections.find(query).sort({createdAt: -1});
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/contest-winner/:id', async(req, res)=> {
            const id = req.params.id;
            const query = {contestId: id};
            const result = await winnerCollections.findOne(query);
            res.send(result);
        })

        app.get('/latest-winner', async(req, res)=> {
            const sort = {createdAt: -1};
            const cursor = winnerCollections.find().sort(sort);
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

            const contestQuery = {_id: new ObjectId(contestId)};
            const contentUpdateResult = await contestCollections.updateOne(contestQuery, updateWinner);

            const result = await winnerCollections.insertOne(winnerInfo);
            res.send(result);
        })


        // ? admin dashboard summary
        app.get('/admin-dashboard', verifyToken, verifyAdmin, async(req, res)=> {

            const allUser = await usersCollections.countDocuments({});
            const totalAdmin = await usersCollections.countDocuments({role: 'admin'});
            const totalCreator = await usersCollections.countDocuments({role: 'creator'});
            const totalNormalUser = await usersCollections.countDocuments({role: 'user'});

            const totalContest = await contestCollections.countDocuments({});
            const pendingContest = await contestCollections.countDocuments({status: 'pending'});
            const rejectContest = await contestCollections.countDocuments({status: 'rejected'});
            const approvedContest = await contestCollections.countDocuments({status: 'approved'});


            const totalPayment = await paymentCollections.countDocuments({});

            const totalWinner = await winnerCollections.countDocuments({});

            const totalParticipant = await participantCollections.countDocuments({});

            const totalSubmitContest = await submittedContestCollections.countDocuments({});

            res.send({
                allUser,
                totalAdmin,
                totalCreator,
                totalNormalUser,
                totalContest,
                approvedContest,
                pendingContest,
                rejectContest,
                totalPayment,
                totalWinner,
                totalParticipant,
                totalSubmitContest
            })
        })

        // ? creator dashboard summary
        app.get('/creator-dashboard',verifyToken, verifyCreator, async(req, res)=> {
            const email = req.decode_email;

            const totalContest = await contestCollections.countDocuments({creatorEmail: email});
            const pendingContest = await contestCollections.countDocuments({creatorEmail: email, status: 'pending'});
            const rejectedContest = await contestCollections.countDocuments({creatorEmail: email, status: 'rejected'});
            const activeContest = await contestCollections.countDocuments({creatorEmail: email, winnerDeclare: 'no'});

            res.send({
                totalContest,
                pendingContest,
                rejectedContest,
                activeContest
            })
        })

        // ? user dashboard summary
        app.get('/user-dashboard', verifyToken, async(req, res)=> {
            const email = req.decode_email;

            const totalParticipant = await participantCollections.countDocuments({participantEmail: email});
            const totalWin = await winnerCollections.countDocuments({winnerEmail: email});

            const totalPrize = await winnerCollections.aggregate([
                { $match: { winnerEmail: email } },
                {
                $group: {
                    _id: null,
                    totalMoney: { $sum: "$prizeMoney" }
                }
                }
            ]).toArray();
            const totalMoney = totalPrize.length > 0 ? totalPrize[0].totalMoney : 0;

            const winningPercentage = ((totalWin / totalParticipant) * 100).toFixed(2);
            
            res.send({totalParticipant, totalWin, totalMoney, winningPercentage});
        })

        app.get('/winner-and-prize', async(req, res)=> {
            const totalWinner = await winnerCollections.countDocuments({});
            const result = await winnerCollections.aggregate([
                {
                    $group: {
                    _id: null,
                    totalPrizeMoney: { $sum: "$prizeMoney" }
                    }
                }
                ]).toArray();

            const totalPrizeMoney = result[0]?.totalPrizeMoney || 0;

            res.send({totalWinner, totalPrizeMoney});
        })

        // ? leaderboard api
        app.get('/leaderboard', async (req, res) => {
            try {
                const leaderboard = await winnerCollections.aggregate([
                {
                    $group: {
                    _id: "$winnerEmail",              
                    winnerName: { $first: "$winnerName" },
                    winnerPhoto: { $first: "$winnerPhoto" },
                    totalWins: { $sum: 1 },
                    totalPrize: { $sum: "$prizeMoney" },
                    recentWin: { $last: "$contestName" }
                    }
                },
                {
                    $lookup: {
                    from: "participant",
                    localField: "_id",               
                    foreignField: "participantEmail",
                    as: "participations"
                    }
                },
                {
                    $addFields: {
                    totalParticipations: { $size: "$participations" },
                    winningPercentage: {
                        $cond: [
                        { $eq: [{ $size: "$participations" }, 0] },
                        0,
                        { $multiply: [{ $divide: ["$totalWins", { $size: "$participations" }] }, 100] }
                        ]
                    }
                    }
                },
                {
                    $project: {
                    participations: 0
                    }
                },
                { $sort: { totalWins: -1, totalPrize: -1 } }
                ]).toArray();

                res.send(leaderboard);

            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Something went wrong" });
            }
        });


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