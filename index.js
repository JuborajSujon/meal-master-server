const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "meal-master-chef.web.app",
    "meal-master-chef.firebaseapp.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@smdeveloper.7rzkdcv.mongodb.net/?retryWrites=true&w=majority&appName=SMDeveloper`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const memberShipCollection = client
      .db("mealmasterdb")
      .collection("membership");
    const usersCollection = client.db("mealmasterdb").collection("users");

    app.get("/membership", async (req, res) => {
      const result = await memberShipCollection.find({}).toArray();
      res.send(result);
    });

    // save user data in db
    app.put("/user", async (req, res) => {
      const user = req.body;
      const filter = { email: user?.email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: user?.name,
          email: user?.email,
          photo: user?.photo,
          lastLogin: user?.lastLogin,
        },
        $setOnInsert: {
          role: user?.role,
          status: user?.status,
          createdAt: user?.createdAt,
        },
      };
      console.log(updateDoc);
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    console.log("You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.log);

app.get("/", (req, res) => {
  res.send("Hello from meal master Server..");
});

app.listen(port, () => {
  console.log(`Server is running on Local: http://localhost:${port}`);
});
