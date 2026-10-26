import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { protect } from "../middleware/authMiddleware.js";
import express from "express";

const authRouter = Router();
const parseProfileImage = express.raw({ type: () => true, limit: "5mb" });

function handleProfileImageBody(req, res, next) {
  parseProfileImage(req, res, (error) => {
    if (!error) return next();
    if (error.type === "entity.too.large") {
      return res.status(413).json({ message: "Image must be 5 MB or smaller" });
    }
    console.error("Unable to parse profile image upload:", error);
    return res.status(400).json({ message: "Unable to read image upload" });
  });
}

// POST -> /api/auth/register
authRouter.post("/register", authController.register);

// POST -> /api/auth/login
authRouter.post("/login", authController.login);

// GET -> /api/auth/get-me
authRouter.get("/get-me", protect, authController.getme);

// PATCH -> /api/auth/profile
authRouter.patch("/profile", protect, authController.updateProfile);

// PUT -> /api/auth/profile/image
authRouter.put(
  "/profile/image",
  protect,
  handleProfileImageBody,
  authController.updateProfileImage,
);

// DELETE ->  /api/profile/image
authRouter.delete("/profile/image", protect, authController.removeProfileImage);

// GET -> /api/auth/refresh-token
authRouter.get("/refresh-token", authController.refreshtoken);

// GET -> /api/auth/logout
authRouter.get("/logout", authController.logout);

export default authRouter;

// POST   /api/auth/register
// GET    /api/auth/login
// GET    /api/auth/get-me
// GET    /api/auth/refresh-token
// GET    /api/auth/logout
