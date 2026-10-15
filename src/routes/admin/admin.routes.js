import { Router } from "express";
import adminProductRouter from "./adminProduct.routes.js";
import adminUserRouter from "./adminUser.routes.js";

const adminRouter = Router();

adminRouter.use("/products", adminProductRouter);
adminRouter.use("/users", adminUserRouter);

export default adminRouter;