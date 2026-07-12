// routes/paymentRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { createOrder, verifyPayment, myPayments } from "../controllers/paymentController.js";

const router = express.Router();

// Webhook is mounted directly in index.js (raw body, no JSON parser).
// Everything else is auth'd Bearer-token.

router.post("/order",  protect, createOrder);
router.post("/verify", protect, verifyPayment);
router.get ("/mine",   protect, myPayments);

export default router;
