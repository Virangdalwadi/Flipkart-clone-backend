import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";

const authRouter = Router();

// POST -> /api/auth/register
authRouter.post("/register", authController.register);

// POST -> /api/auth/login
authRouter.post("/login", authController.login);

// GET -> /api/auth/get-me
authRouter.get("/get-me", authController.getme);

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
