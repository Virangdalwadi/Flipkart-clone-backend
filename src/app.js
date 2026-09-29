import express from "express";
import morgan from "morgan";
import authRouter from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import cors from "cors";
import paymentRouter from "./routes/payment.routes.js";
import cartRouter from "./routes/cart.routes.js";
import addressRouter from "./routes/address.routes.js";
import orderRoutes from "./routes/order.routes.js";

dotenv.config();
const app = express();

app.use(
  cors({
    // Splits the comma-separated string into an array of URLs
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : [],
    credentials: true,
  }),
);

app.use(express.json());
app.use(morgan("dev")); //combine, common, dev, short, tiny
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/cart", cartRouter);
app.use("/api/addresses", addressRouter);
app.use("/api/orders", orderRoutes);

app.get("/", (req, res) => {
  res.send("Flipkart clone backend is running");
});

export default app;
