import express from "express";
import cors from "cors";

import chatRouter from "./routes/chatRoutes.js";
import authRouter from "./routes/auth.routes.js";

const app = express();

app.use(
  cors({
    exposedHeaders: ["X-Session-Id"],
  })
);

app.use(express.json());

app.get("/", (_, res) => {
  res.send("This one is Home");
});

app.use("/", chatRouter);
app.use("/auth", authRouter);

export default app;
