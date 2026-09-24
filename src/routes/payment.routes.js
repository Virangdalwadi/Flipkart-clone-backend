import express from "express";
import {
  createRazorpayOrder,
  verifyPayment,
} from "../controllers/payment.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// POST    /api/create-order
router.post("/create-order", protect, createRazorpayOrder);

// POST    /api/verify
router.post("/verify", protect, verifyPayment);

export default router;
