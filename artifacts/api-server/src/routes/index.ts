import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gaslessRouter from "./gasless.js";
import walletRouter from "./wallet.js";
import tronRouter from "./tron.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gaslessRouter);
router.use(walletRouter);
router.use(tronRouter);

export default router;
