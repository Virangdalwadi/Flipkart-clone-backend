import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
} from "../controllers/address.controller.js";

const addressRouter = Router();

addressRouter.use(protect);

// POST    /api/address
addressRouter.post("/", createAddress);

// GET     /api/address
addressRouter.get("/", getAddresses);

// GET     /api/address/:id
addressRouter.get("/:id", getAddressById);

// PUT     /api/address/:id
addressRouter.put("/:id", updateAddress);

// DELETE   /api/address/:id
addressRouter.delete("/:id", deleteAddress);

export default addressRouter;
