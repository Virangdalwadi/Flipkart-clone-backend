import { Router } from "express";

import {
  getSellerProduct,
  createSellerProduct,
  updateSellerProduct,
  deleteSellerProduct,
} from "../../controllers/seller/sellerProduct.controller.js";

import protect from "../../middleware/authMiddleware.js";
import sellerMiddleware from "../../middleware/sellerMiddleware.js";

const sellerProductRoutes = Router();

// Authenticate the user and verify seller role
sellerProductRoutes.use(protect);
sellerProductRoutes.use(sellerMiddleware);

// Seller product CRUD
sellerProductRoutes.get("/", getSellerProduct);
sellerProductRoutes.post("/", createSellerProduct);
sellerProductRoutes.patch("/:id", updateSellerProduct);
sellerProductRoutes.delete("/:id", deleteSellerProduct);

export default sellerProductRoutes;
