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
    origin: ["https://fliipkart-clone.netlify.app", "http://localhost:5173"], // Netlify Link and your Vite dev server
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
app.get("/", (req, res) => {
  res.send("Flipkart clone backend is running");
});

export default app;
