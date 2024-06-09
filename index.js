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

    const cartCollection = client.db("mealmasterdb").collection("carts");

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

    // get menu data from db
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    // get single menu data from db
    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    // Update menu data in db
    app.put("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const updatedItem = req.body;
      console.log(updatedItem);
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...updatedItem,
        },
      };

      const result = await menuCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // delete menu data from db
    app.delete("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    // save upcoming meal data in db
    app.post("/upcoming-meal", verifyToken, verifyAdmin, async (req, res) => {
      const upcomingMeal = req.body;
      const result = await upcomingMealCollection.insertOne(upcomingMeal);
      res.send(result);
    });

    // get upcoming meal data from db
    app.get("/upcoming-meals", async (req, res) => {
      const result = await upcomingMealCollection.find().toArray();
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
          badge: user?.badge,
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

    // get user data specific from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // get all user data from db
    app.get("/users", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const search = req.query.search;
      let query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };

      const result = await usersCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      const count = await usersCollection.countDocuments(query);
      res.send({ result, count });
    });

    // get user make admin from db
    app.patch("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const updateDoc = {
        $set: {
          ...user,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Save User Review
    app.post("/review/:id", async (req, res) => {
      const review = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      try {
        const meal = await menuCollection.findOne(query);
        // if meal not found
        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }

        // update review
        const doc = {
          $push: {
            reviews: review,
          },
        };
        const result = await menuCollection.updateOne(query, doc);

        // recalculate rating object
        const updatedMeal = await menuCollection.findOne(query);
        const reviewCount = updatedMeal.reviews.length;
        const totalRating = updatedMeal.reviews.reduce(
          (total, review) => total + review.rating,
          0
        );

        const averageRating = (totalRating / reviewCount).toFixed(1);

        const ratingObj = {
          reviewCount,
          totalRating,
          averageRating,
        };

        // update rating object
        const ratingDoc = {
          $set: {
            rating: ratingObj,
          },
        };
        await menuCollection.updateOne(query, ratingDoc);

        // calculate the count of each star rating
        const ratingDistribution = await menuCollection
          .aggregate([
            {
              $match: query,
            },
            {
              $unwind: "$reviews",
            },
            {
              $group: {
                _id: "$reviews.rating",
                count: { $sum: 1 },
              },
            },
            {
              $sort: { _id: 1 },
            },
          ])
          .toArray();

        const ratingCount = ratingDistribution.reduce((acc, { _id, count }) => {
          acc[_id] = count;
          return acc;
        }, {});

        // update the meal rating and rating distribution
        const ratingResult = await menuCollection.updateOne(query, {
          $set: {
            rating: ratingObj,
            ratingCount: ratingCount,
          },
        });

        res.send(ratingResult);
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });

    // get all review
    app.get("/all-reviews", async (req, res) => {
      try {
        const result = await menuCollection
          .aggregate([
            { $unwind: "$reviews" },
            {
              $project: {
                _id: 1,
                meal_title: 1,
                "reviews.user_id": 1,
                "reviews.rating": 1,
                "reviews.review": 1,
                "reviews.created_time": 1,
                likes_count: 1,
                rating: 1,
              },
            },
            {
              $group: {
                _id: "$_id",
                meal_title: { $first: "$meal_title" },
                reviews: { $push: "$reviews" },
                likes_count: { $first: "$likes_count" },
                rating: { $first: "$rating" },
                meal_review_count: { $sum: 1 },
              },
            },
            { $unwind: "$reviews" },
            {
              $project: {
                _id: 1,
                meal_title: 1,
                "reviews.user_id": 1,
                "reviews.rating": 1,
                "reviews.review": 1,
                "reviews.created_time": 1,
                likes_count: 1,
                rating: 1,
                meal_review_count: 1,
              },
            },
          ])
          .toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });

    // get user review
    app.get("/reviews", async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }
      try {
        // get user review base on email
        const result = await menuCollection
          .aggregate([
            { $match: { "reviews.email": email } },
            { $unwind: "$reviews" },
            { $match: { "reviews.email": email } },
            {
              $project: {
                _id: 1,
                meal_title: 1,
                "reviews.user_id": 1,
                "reviews.name": 1,
                "reviews.email": 1,
                "reviews.photo": 1,
                "reviews.rating": 1,
                "reviews.review": 1,
                "reviews.created_time": 1,
                likes_count: 1,
                rating: 1,
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });

    // updata user reviw by created_time
    app.put("/review/:reviewId", async (req, res) => {
      try {
        const { reviewId } = req.params;
        const { rating, review, created_time } = req.body;

        // update review
        const result = await menuCollection.updateOne(
          { "reviews.created_time": created_time },
          {
            $set: {
              "reviews.$.rating": rating,
              "reviews.$.review": review,
              "reviews.$.created_time": created_time,
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Review not found" });
        }

        // recalculate rating object
        const meal = await menuCollection.findOne({
          "reviews.created_time": created_time,
        });
        const reviewCount = meal.reviews.length;
        const totalRating = meal.reviews.reduce(
          (total, review) => total + review.rating,
          0
        );
        const averageRating = (totalRating / reviewCount).toFixed(1);

        await menuCollection.updateOne(
          { "reviews.created_time": created_time },
          {
            $set: {
              rating: {
                reviewCount,
                totalRating,
                averageRating,
              },
            },
          }
        );

        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });

    // delete user review
    app.delete("/review/:reviewId", async (req, res) => {
      try {
        const { reviewId } = req.params;
        const result = await menuCollection.updateOne(
          { "reviews.created_time": reviewId },
          {
            $pull: {
              reviews: {
                created_time: reviewId,
              },
            },
          }
        );
        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });

    // save like data in menu db
    app.post("/like", async (req, res) => {
      const { meal_id, user_id, name, email, photo, liked, created_time } =
        req.body;
      const query = { _id: new ObjectId(meal_id) };
      try {
        const meal = await menuCollection.findOne(query);
        // if meal not found
        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }
        // if like already exist
        const userLikeIndex = meal.likes.findIndex(
          (like) => like.user_id === user_id
        );

        // if like exist
        if (userLikeIndex > -1) {
          // update like
          meal.likes[userLikeIndex].liked = liked;
          meal.likes[userLikeIndex].created_time = created_time;

          // recalculate total likes count by liked or not
          meal.likes_count = meal.likes.filter((like) => like.liked).length;
          console.log(meal.likes_count);
          const result = await menuCollection.updateOne(query, {
            $set: { likes: meal.likes, likes_count: meal.likes_count },
          });
          res.send(result);
        } else {
          // if like not exist
          meal.likes.push({
            user_id,
            name,
            email,
            photo,
            liked,
            created_time: Date.now(),
          });

          // recalculate total likes count by liked or not
          meal.likes_count = meal.likes.filter((like) => like.liked).length;

          console.log(meal.likes_count);

          const result = await menuCollection.updateOne(query, {
            $set: { likes: meal.likes, likes_count: meal.likes_count },
          });

          res.send(result);
        }
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });
    // save like data in upcoming db
    app.post("/upcoming-like", async (req, res) => {
      const { meal_id, user_id, name, email, photo, liked, created_time } =
        req.body;
      const query = { _id: new ObjectId(meal_id) };
      try {
        const meal = await upcomingMealCollection.findOne(query);
        // if meal not found
        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }
        // if like already exist
        const userLikeIndex = meal.likes.findIndex(
          (like) => like.user_id === user_id
        );

        // if like exist
        if (userLikeIndex > -1) {
          // update like
          meal.likes[userLikeIndex].liked = liked;
          meal.likes[userLikeIndex].created_time = created_time;

          // recalculate total likes count by liked or not
          meal.likes_count = meal.likes.filter((like) => like.liked).length;
          console.log(meal.likes_count);
          const result = await upcomingMealCollection.updateOne(query, {
            $set: { likes: meal.likes, likes_count: meal.likes_count },
          });
          res.send(result);
        } else {
          // if like not exist
          meal.likes.push({
            user_id,
            name,
            email,
            photo,
            liked,
            created_time: Date.now(),
          });

          // recalculate total likes count by liked or not
          meal.likes_count = meal.likes.filter((like) => like.liked).length;

          const result = await upcomingMealCollection.updateOne(query, {
            $set: { likes: meal.likes, likes_count: meal.likes_count },
          });

          res.send(result);
        }
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });

    // save cart data in menu db
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    // carts data get in menu db
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      // check user email exist or not
      if (!email) {
        return res.status(400).send([]);
      }

      // get carts data
      try {
        const userDocuments = await cartCollection.find(query).toArray();
        const result = await Promise.all(
          userDocuments.map(async (item) => {
            const menu = await menuCollection.findOne({
              _id: new ObjectId(item.menuId),
            });
            return { ...item, menu: menu || null };
          })
        );

        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send(err);
      }
    });

    // carts data delete in menu db
    app.delete("/carts/:id", async (req, res) => {
      const menuId = req.params.id;
      const query = { _id: new ObjectId(menuId) };
      const result = await cartCollection.deleteOne(query);
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
