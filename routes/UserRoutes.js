// routes/userRoutes.js
import express from "express";
import { protect, verifyAdmin, verifyUser } from "../middleware/auth.js";
import {
  registerUser,
  verifyUserOtp,
  loginUser,
  refreshToken,
  logout,
  forgotPasswordMobile,
  verifyResetOtp,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateEmail,
  deleteAccount,
  togglePaidStatusForCourse,
  getCurrentUser,
  markUserPaidForCourse, 
  unmarkUserPaidForCourse,
  getUsersByCourse,
  updateCourseProgress,
  updateCourseTestResult,
  trackCourseVisit
} from "../controllers/usercontroller.js";

import { validateRequest as validate }  from "../middleware/validateRequest.js";
import {
  registerUserSchema,
  verifyUserOtpSchema,
  loginUserSchema,
  forgotPasswordMobileSchema,
  verifyResetOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateEmailSchema,
  markPaidForCourseSchema, 
  unmarkPaidForCourseSchema,
  togglePaidStatusForCourseSchema,
  getCurrentUserSchema
} from "../validation/userSchemas.js";

const router = express.Router();

// ---------- Public Routes ----------
router.post("/register", validate(registerUserSchema), registerUser);
router.post("/verify-otp", validate(verifyUserOtpSchema), verifyUserOtp);
router.post("/login", validate(loginUserSchema), loginUser);

router.post("/forgot-password/mobile", validate(forgotPasswordMobileSchema), forgotPasswordMobile);
router.post("/verify-reset-otp", validate(verifyResetOtpSchema), verifyResetOtp);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password/:token", validate(resetPasswordSchema), resetPassword);

// Refresh uses HttpOnly cookie
router.post("/auth/refresh", refreshToken);

// ---------- Protected-ish Routes ----------
router.post("/logout",  logout);
// Prefer /current in frontend, keep /me for internal/debug
router.get("/me", protect, getUserProfile);
router.get("/current", verifyUser, validate(getCurrentUserSchema), getCurrentUser);


router.patch("/email", protect, validate(updateEmailSchema), updateEmail);
router.delete("/account", protect, deleteAccount);

// ---------- Payment / Admin-ish Routes ----------

router.post("/:userId/course/:courseId/markPaid", verifyAdmin, validate(markPaidForCourseSchema), markUserPaidForCourse);
router.post("/:userId/course/:courseId/unmarkPaid", verifyAdmin, validate(unmarkPaidForCourseSchema), unmarkUserPaidForCourse);
router.post("/:userId/course/:courseId/togglePaid", verifyAdmin, validate(togglePaidStatusForCourseSchema), togglePaidStatusForCourse);

// router.post("/mark-paid", verifyAdmin, validate(markPaidForCourseSchema), markUserPaidForCourse);
// router.post("/unmark-paid", verifyAdmin, validate(unmarkPaidForCourseSchema), unmarkUserPaidForCourse);
// router.patch("/:userId/toggle-paid", verifyAdmin, validate(togglePaidStatusForCourseSchema), togglePaidStatusForCourse);

router.post("/track-course/:userId/:courseId", protect, trackCourseVisit);
router.get("/course/:courseId", verifyAdmin, getUsersByCourse);
router.put("/admin/user/:userId/course/:courseId/progress", verifyAdmin, updateCourseProgress);
router.put("/admin/user/:userId/course/:courseId/test", verifyAdmin, updateCourseTestResult);



export default router;


