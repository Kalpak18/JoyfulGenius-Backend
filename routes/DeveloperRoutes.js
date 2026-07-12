// routes/DeveloperRoutes.js
//
// Mounted at /api/developer.
// Every developer HTTP endpoint lives here — nothing developer-related
// exists on /api/admin. Uses developerController + verifyDeveloperOnly,
// never any admin controller/middleware.

import express from "express";
import {
  registerDeveloper,
  loginDeveloper,
  refreshDeveloperToken,
  logoutDeveloper,
  listAdminAccounts,
  createAdminAccount,
  deleteAdminAccount,
} from "../controllers/developerController.js";
import { verifyDeveloperOnly } from "../middleware/verifyDeveloperOnly.js";

const router = express.Router();

// ── Session lifecycle ──
router.post("/register", registerDeveloper);   // one-time; locked after first developer
router.post("/login",    loginDeveloper);
router.post("/refresh",  refreshDeveloperToken);
router.post("/logout",   verifyDeveloperOnly, logoutDeveloper);

// ── Manage admin accounts (the only developer capability) ──
router.get   ("/admins",     verifyDeveloperOnly, listAdminAccounts);
router.post  ("/admins",     verifyDeveloperOnly, createAdminAccount);
router.delete("/admins/:id", verifyDeveloperOnly, deleteAdminAccount);

export default router;
