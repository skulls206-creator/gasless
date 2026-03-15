import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gaslessRouter from "./gasless.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gaslessRouter);

export default router;
