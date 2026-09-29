import express from "express";
import { getMyOrders, getOrderById } from "../controllers/order.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get logged-in user's orders
router.get("/", protect, getMyOrders);

// Get single order
router.get("/:id", protect, getOrderById);

export default router;
