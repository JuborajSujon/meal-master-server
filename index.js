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

// verify token general user
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const memberShipCollection = client
      .db("mealmasterdb")
      .collection("membership");
    const usersCollection = client.db("mealmasterdb").collection("users");
    const menuCollection = client.db("mealmasterdb").collection("menu");
    const upcomingMealCollection = client
      .db("mealmasterdb")
      .collection("upcomingmealdb");

    // jwt token generate
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // verify token admin user
    const verifyAdmin = async (req, res, next) => {
      email = req.user?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    app.get("/membership", async (req, res) => {
      const result = await memberShipCollection.find({}).toArray();
      res.send(result);
    });

    // save menu data in db
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menuItem = req.body;
      const result = await menuCollection.insertOne(menuItem);
      res.send(result);
    });

    // save upcoming meal data in db
    app.post("/upcoming-meal", verifyToken, verifyAdmin, async (req, res) => {
      const upcomingMeal = req.body;
      const result = await upcomingMealCollection.insertOne(upcomingMeal);
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
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // get user data
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
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
