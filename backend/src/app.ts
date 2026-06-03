import express from "express";
import cors from "cors";

import chatRouter from "./routes/chatRoutes.js";
import authRouter from "./routes/auth.routes.js";
import ownerRouter from "./routes/owner/owner.routes.js";
import managerRouter from "./routes/manager/manager.routes.js";

import { authenticate } from "./middleware/auth.middleware.js";
import { authorize } from "./middleware/role.middleware.js";
import { requireCompany } from "./middleware/company.middleware.js";

const app = express();

app.use(
  cors({
    exposedHeaders: ["X-Session-Id"],
  })
);

app.use(express.json());

app.get("/", (_, res) => {
  res.send("This one is public Home");
});

app.get("/admin", authenticate, authorize("platform_admin"), (_, res) => {
  res.send("This one is platform admin");
});

app.get(
  "/owner",
  authenticate,
  requireCompany,
  authorize("owner"),
  (_, res) => {
    res.send("This one is company owner");
  }
);

app.get(
  "/manager",
  authenticate,
  requireCompany,
  authorize("manager"),
  (_, res) => {
    res.send("This one is company manager");
  }
);

app.get(
  "/employee",
  authenticate,
  requireCompany,
  authorize("employee"),
  (_, res) => {
    res.send("This one is company employee");
  }
);

app.use("/", chatRouter);
app.use("/auth", authRouter);
app.use("/owner", ownerRouter);
app.use("/manager", managerRouter);

export default app;
