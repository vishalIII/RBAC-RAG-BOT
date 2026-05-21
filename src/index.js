import express from "express";
import cors from "cors";

const app = express();

app.use(cors());

app.use(express.json());

app.get("/", async (req, res) => {
  res.send("This one is Home");
});



app.listen(3000, () => {
  console.log("Server running on port 3000");
});

