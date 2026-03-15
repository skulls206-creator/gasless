import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gaslessRouter from "./gasless.js";
import walletRouter from "./wallet.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gaslessRouter);
router.use(walletRouter);

export default router;
