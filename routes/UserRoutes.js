import express from 'express';
import {
  registerUser,
  verifyUserOtp,
  loginUser,
  markPaid,
  togglePaidStatus,
  getUserProfile
} from '../controllers/usercontroller.js';
import { verifyAdmin } from '../middleware/auth.js';
import { verifyUser } from '../middleware/auth.js';

const router = express.Router();

router.post('/send-otp', registerUser);
router.post('/verify-otp', verifyUserOtp);
router.post('/login', loginUser);
router.post("/mark-paid", verifyAdmin, markPaid);
router.patch("/toggle-paid/:userId", verifyAdmin, togglePaidStatus);
router.get("/profile", verifyUser, getUserProfile);
export default router;
