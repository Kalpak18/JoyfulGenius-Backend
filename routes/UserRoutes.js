import express from 'express';
import {
  registerUser,
  // verifyUserOtp,
  loginUser,
  markPaid,
  togglePaidStatus,
  getUserProfile,
  forgotPassword,
  resetPassword,
  forgotPasswordMobile,
  verifyResetOtp,
  updateEmail,
  deleteAccount,
  getCurrentUser
} from '../controllers/usercontroller.js';
import { verifyAdmin } from '../middleware/auth.js';
import { verifyUser } from '../middleware/auth.js';
import { protect } from '../controllers/authController.js';


const router = express.Router();


router.post('/register', registerUser);
// router.post('/send-otp', registerUser);
// router.post('/verify-otp', verifyUserOtp);
router.post('/login', loginUser);
router.post("/mark-paid", verifyAdmin, markPaid);
router.patch("/toggle-paid/:userId", verifyAdmin, togglePaidStatus);
router.get("/profile", verifyUser, getUserProfile);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/forgot-password-mobile', forgotPasswordMobile);
router.post('/verify-reset-otp', verifyResetOtp);

router.patch("/update-email", verifyUser, updateEmail);

// ✅ Delete Account
router.delete("/delete-account", verifyUser, deleteAccount);




router.get("/me", protect, getCurrentUser);


export default router;
