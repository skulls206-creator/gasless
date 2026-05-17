import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import versionRouter from "./version.js";
import gaslessRouter from "./gasless.js";
import walletRouter from "./wallet.js";
import tronRouter from "./tron.js";
import pushRouter, { startTransactionPoller } from "./push.js";
import swapRouter from "./swap.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(versionRouter);
router.use(gaslessRouter);
router.use(walletRouter);
router.use(tronRouter);
router.use(pushRouter);
router.use(swapRouter);

startTransactionPoller();

export default router;
