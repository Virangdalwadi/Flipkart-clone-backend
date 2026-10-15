import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  updateProduct,
  updateProductStatus,
} from "../../controllers/admin/adminProduct.controller.js";

const adminProductRouter = Router();

adminProductRouter.get("/", getProducts);
adminProductRouter.post("/", createProduct);
adminProductRouter.get("/:id", getProductById);
adminProductRouter.patch("/:id/status", updateProductStatus);
adminProductRouter.patch("/:id", updateProduct);
adminProductRouter.delete("/:id", deleteProduct);

export default adminProductRouter;