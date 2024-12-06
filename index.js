const express = require("express");
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const crypto = require("crypto");

const app = express();

// middleware
const allowedOrigins = [
  "http://localhost:5173",
  "https://bangla-hub.web.app",
  "https://bangla-hub.firebaseapp.com",
];

// CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        var msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.p09ke.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const wordCollection = client.db("bd_DB").collection("words");

    // words api

    // post word
    app.post("/words", async (req, res) => {
      const { word, meaning, category } = req.body;

      const id = crypto.randomBytes(16).toString("hex");

      const wordObject = {
        id: id,
        word: word,
        meaning: meaning,
      };

      try {
        const existingCategory = await wordCollection.findOne({
          [category]: { $exists: true },
        });

        if (existingCategory) {
          const result = await wordCollection.updateOne(
            { [category]: { $exists: true } },
            { $push: { [category]: wordObject } }
          );
          res.send(result);
        } else {
          const newCategoryDocument = {
            [category]: [wordObject],
          };
          const result = await wordCollection.insertOne(newCategoryDocument);
          res.send(result);
        }
      } catch (error) {
        console.error("Error adding word:", error);
        res.status(500).send({ error: "Failed to add word" });
      }
    });

    // get word

    app.get("/words", async (req, res) => {
      try {
        const results = await wordCollection.find({}).toArray();
        res.send(results);
      } catch (error) {
        res.status(500).send({ error: "Failed to retrieve words" });
      }
    });

    // Get specific word for update
    app.get("/words/:category/:id", async (req, res) => {
      const { category, id } = req.params;

      try {
        const result = await wordCollection.findOne({
          [category]: { $elemMatch: { id: id } },
        });

        if (!result) {
          return res.status(404).send({ error: "Word not found" });
        }

        const word = result[category].find((item) => item.id === id);
        res.send(word);
      } catch (error) {
        console.error("Error retrieving word:", error);
        res.status(500).send({ error: "Failed to retrieve word" });
      }
    });

    // Update word route
    app.put("/words/:category/:id", async (req, res) => {
      const { category, id } = req.params;
      const { word, meaning, newCategory } = req.body;

      try {
        // If category is changing
        if (newCategory && newCategory !== category) {
          // Remove the word from the old category
          // Remove from old category
          const removeFromOldCategory = await wordCollection.updateOne(
            { [category]: { $elemMatch: { id: id } } },
            { $pull: { [category]: { id: id } } }
          );

          // Add to new category
          const addToNewCategory = await wordCollection.updateOne(
            { [newCategory]: { $exists: true } },
            {
              $push: {
                [newCategory]: {
                  id: id,
                  word: word,
                  meaning: meaning,
                },
              },
            },
            { upsert: true }
          );

          res.send({
            success: true,
            message: "Word updated and category changed successfully",
            updatedWord: { word, meaning, category: newCategory },
          });
        } else {
          // Update within the same category
          const result = await wordCollection.updateOne(
            { [category]: { $elemMatch: { id: id } } },
            {
              $set: {
                [`${category}.$[elem].word`]: word,
                [`${category}.$[elem].meaning`]: meaning,
              },
            },
            {
              arrayFilters: [{ "elem.id": id }],
            }
          );

          if (result.matchedCount === 0) {
            return res.status(404).send({ error: "Word not found" });
          }

          res.send({
            success: true,
            message: "Word updated successfully",
            updatedWord: { word, meaning, category },
          });
        }
      } catch (error) {
        console.error("Error updating word:", error);
        res.status(500).send({ error: "Failed to update word" });
      }
    });

    // delete word

    app.delete("/words/:category/:id", async (req, res) => {
      const { category, id } = req.params;
      try {
        const result = await wordCollection.updateOne(
          { [category]: { $exists: true } },
          { $pull: { [category]: { id: id } } }
        );
        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "Word not found" });
        }
        res.send({ success: true, message: "Word deleted successfully" });
      } catch (error) {
        console.error("Error deleting word:", error);
        res.status(500).send({ error: "Failed to delete word" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("banglish dictionary server is running");
});

app.listen(port, () => {
  console.log(`server is running on ${port}`);
});
