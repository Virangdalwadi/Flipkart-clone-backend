import express from "express";
import morgan from "morgan";
import authRouter from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import paymentRouter from "./routes/payment.routes.js";
import cartRouter from "./routes/cart.routes.js";
import addressRouter from "./routes/address.routes.js";

const app = express();

app.use(
  cors({
    // origin: "http://localhost:5173", // your Vite dev server
    origin: "https://fliipkart-clone.netlify.app", //your Netlify link
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

export default app;
