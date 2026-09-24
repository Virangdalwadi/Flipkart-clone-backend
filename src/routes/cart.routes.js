import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  addToCart,
  clearCart,
  getCart,
  mergeGuestCart,
  removeCartItem,
  updateCartItem,
} from "../controllers/cart.controller.js";

const cartRouter = Router();

// GET   /api/cart
cartRouter.get("/", protect, getCart);

// POST   /api/cart
cartRouter.post("/", protect, addToCart);

// POST   /api/cart
cartRouter.post("/merge", protect, mergeGuestCart);

// PUT   /api/cart
cartRouter.put("/:productId", protect, updateCartItem);

// DELETE   /api/cart/:productId
cartRouter.delete("/:productId", protect, removeCartItem);

// DELETE   /api/cart
cartRouter.delete("/", protect, clearCart);

export default cartRouter;
