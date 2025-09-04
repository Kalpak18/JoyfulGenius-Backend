// routes/otpRoutes.js
import express from "express";
import { sendOtp, verifyOtp } from "../controllers/otpController.js";
import {validateRequest as validate} from "../middleware/validateRequest.js";
import { sendOtpSchema, verifyOtpSchema } from "../validation/otpSchemas.js";

const router = express.Router();

router.post("/send", validate(sendOtpSchema), sendOtp);
router.post("/verify", validate(verifyOtpSchema), verifyOtp);

export default router;
