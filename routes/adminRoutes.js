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
  getUserTestResults
} from "../controllers/AdminController.js";
import { validateRequest as validate } from "../middleware/validateRequest.js";
import { verifyAdmin } from "../middleware/auth.js";
import {
  loginAdminSchema,
  updateUserSchema,
  deleteUserSchema,
  getUserTestResultsSchema
} from "../validation/adminSchemas.js";

const router = express.Router();

// Public admin login
router.post("/login", validate(loginAdminSchema), loginAdmin);
router.post("/refresh", refreshAdminAccessToken);
router.post("/logout", logoutAdmin);

// Protected admin routes
router.get("/paid-users", verifyAdmin, getPaidUsers);
router.get("/users", verifyAdmin, getAllUsers);

router.patch("/users/:id", verifyAdmin, validate(updateUserSchema), updateUser);

router.delete("/users/:id", verifyAdmin, validate(deleteUserSchema), deleteUser);


router.get("/stats", verifyAdmin, getAdminStats);

router.get(
  "/users/:userId/results",
  verifyAdmin,
  validate(getUserTestResultsSchema),
  getUserTestResults
);

export default router;
