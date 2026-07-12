// routes/userRoutes.js
import express from "express";
import { protect, verifyAdmin, verifyUser } from "../middleware/auth.js";
import {
  registerUser,
  verifyUserOtp,
  resendRegistrationOtp,
  loginUser,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateEmail,
  deleteAccount,
  exportMyData,
  getCurrentUser,
  getUsersByCourse,
  updateCourseProgress,
  updateCourseTestResult,
  trackCourseVisit,
  saveProgress,
  getProgress,
  getProgressSummary,
  addBookmark,
  removeBookmark,
  listBookmarks,
  issueCertificate,
  listCertificates,
  isHandleAvailable,
  setMyHandle,
} from "../controllers/usercontroller.js";

import { validateRequest as validate }  from "../middleware/validateRequest.js";
import {
  registerUserSchema,
  verifyUserOtpSchema,
  resendRegistrationOtpSchema,
  loginUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateEmailSchema,
  getCurrentUserSchema
} from "../validation/userSchemas.js";

const router = express.Router();

// ---------- Public Routes ----------
// Registration is a two-step flow:
//   1. POST /register        → server emails an OTP
//   2. POST /verify-email-otp → user submits OTP, User created, auto-login
router.post("/register",          validate(registerUserSchema),           registerUser);
router.post("/verify-email-otp",  validate(verifyUserOtpSchema),          verifyUserOtp);
router.post("/resend-otp",        validate(resendRegistrationOtpSchema),  resendRegistrationOtp);

router.post("/login",             validate(loginUserSchema),              loginUser);

// Forgot password is email-only (Twilio removed)
router.post("/forgot-password",            validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password/:token",      validate(resetPasswordSchema),  resetPassword);

// Refresh uses HttpOnly cookie
router.post("/auth/refresh", refreshToken);

// ---------- Protected-ish Routes ----------
router.post("/logout",  logout);

// Platform handle (Instagram-style username)
router.get  ("/handle-available", isHandleAvailable);
router.patch("/me/handle",        protect, setMyHandle);

router.get("/me",       protect,    getUserProfile);
router.get("/current",  verifyUser, validate(getCurrentUserSchema), getCurrentUser);

router.patch("/email",    protect, validate(updateEmailSchema), updateEmail);
router.delete("/account", protect, deleteAccount);
router.get("/my-data",    protect, exportMyData);  // GDPR data export

// ---------- Per-course enrollment endpoints ----------
// (Manual mark-paid endpoints were retired. Paid status now only flips via
// verified Razorpay payment or admin /api/admin/grant-access.)
router.post("/track-course/:userId/:courseId", protect,     trackCourseVisit);
router.get  ("/course/:courseId",              verifyAdmin, getUsersByCourse);
router.put  ("/admin/user/:userId/course/:courseId/progress", verifyAdmin, updateCourseProgress);
router.put  ("/admin/user/:userId/course/:courseId/test",     verifyAdmin, updateCourseTestResult);

// ── Lecture progress + resume tracking (student self-service) ──
router.patch("/me/progress",              protect, saveProgress);
router.get  ("/me/progress/:courseId",    protect, getProgress);
router.get  ("/me/progress-summary",      protect, getProgressSummary);

// ── Bookmarks ──
router.get   ("/me/bookmarks",              protect, listBookmarks);
router.post  ("/me/bookmarks",              protect, addBookmark);
router.delete("/me/bookmarks/:lectureId",   protect, removeBookmark);

// ── Certificates ──
router.get  ("/me/certificates",                  protect, listCertificates);
router.post ("/me/certificates/:courseId/issue",  protect, issueCertificate);

export default router;
