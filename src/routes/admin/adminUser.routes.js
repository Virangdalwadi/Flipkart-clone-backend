import { Router } from "express";
import {
  getUserById,
  getUsers,
  updateUserStatus,
} from "../../controllers/admin/adminUser.controller.js";

const adminUserRouter = Router();

adminUserRouter.get("/", getUsers);
adminUserRouter.get("/:id", getUserById);
adminUserRouter.patch("/:id/status", updateUserStatus);

export default adminUserRouter;