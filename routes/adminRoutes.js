// routes/AdminRoutes.js
//
// /api/admin/* — surface for course owners (role="admin") and their
// tutors (role="tutor"). Developer routes are on /api/developer/*.
// This file has zero developer references.

import express from "express";
import {
  loginAdmin,
  refreshAdminAccessToken,
  logoutAdmin,
  getPaidUsers,
  getAllUsers,
  updateUser,
  deleteUser,
  getAdminStats,
  getUserTestResults,
  forgotAdminPassword,
  resetAdminPassword,
  createOwnedTutor,
  listOwnedTutors,
  updateOwnedTutor,
  deleteOwnedTutor,
} from "../controllers/AdminController.js";
import { grantAccess, revokeAccess, listPayments } from "../controllers/paymentController.js";
import { validateRequest as validate } from "../middleware/validateRequest.js";
import { verifyAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";
import {
  loginAdminSchema,
  updateUserSchema,
  deleteUserSchema,
  getUserTestResultsSchema,
  forgotAdminPasswordSchema,
  resetAdminPasswordSchema,
} from "../validation/adminSchemas.js";

const router = express.Router();

// Public admin login + password reset
router.post("/login",                    validate(loginAdminSchema), loginAdmin);
router.post("/refresh",                  refreshAdminAccessToken);
router.post("/logout",                   logoutAdmin);
router.post("/forgot-password",          validate(forgotAdminPasswordSchema), forgotAdminPassword);
router.post("/reset-password/:token",    validate(resetAdminPasswordSchema),  resetAdminPassword);

// Students
router.get   ("/paid-users",             verifyAdmin, getPaidUsers);
router.get   ("/users",                  verifyAdmin, getAllUsers);
router.patch ("/users/:id",              verifyAdmin, auditLog("UPDATE_USER"), validate(updateUserSchema), updateUser);
router.delete("/users/:id",              verifyAdmin, auditLog("DELETE_USER"), validate(deleteUserSchema), deleteUser);
router.get   ("/users/:userId/results",  verifyAdmin, validate(getUserTestResultsSchema), getUserTestResults);

// Stats
router.get   ("/stats",                  verifyAdmin, getAdminStats);

// Paid-access management (audited)
router.post  ("/grant-access",           verifyAdmin, auditLog("GRANT_ACCESS"),  grantAccess);
router.post  ("/revoke-access",          verifyAdmin, auditLog("REVOKE_ACCESS"), revokeAccess);
router.get   ("/payments",               verifyAdmin, listPayments);

// Course-owner tutor management (admins only, enforced in controller)
router.post  ("/my-tutors",              verifyAdmin, auditLog("CREATE_TUTOR"), createOwnedTutor);
router.get   ("/my-tutors",              verifyAdmin, listOwnedTutors);
router.patch ("/my-tutors/:id",          verifyAdmin, auditLog("UPDATE_TUTOR"), updateOwnedTutor);
router.delete("/my-tutors/:id",          verifyAdmin, auditLog("DELETE_TUTOR"), deleteOwnedTutor);

export default router;
