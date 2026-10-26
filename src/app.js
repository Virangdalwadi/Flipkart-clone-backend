import express from "express";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import cors from "cors";

// Routes
import authRouter from "./routes/auth.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import cartRouter from "./routes/cart.routes.js";
import addressRouter from "./routes/address.routes.js";
import orderRoutes from "./routes/order.routes.js";
import productRoutes from "./routes/product.routes.js";
import sellerProductRoutes from "./routes/seller/sellerProduct.routes.js";
import adminRouter from "./routes/admin/admin.routes.js";
import chatRoutes from "./routes/chat.routes.js";

// Middlewares
import { protect } from "./middleware/authMiddleware.js";
import { requireAdmin } from "./middleware/adminMiddleware.js";

dotenv.config();
const app = express();

app.use(
  cors({
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
app.use("/api/products", productRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", protect, requireAdmin, adminRouter);
app.use("/api/seller/products", protect, sellerProductRoutes);

app.get("/", (req, res) => {
  res.send("Flipkart clone backend is running");
});

export default app;
