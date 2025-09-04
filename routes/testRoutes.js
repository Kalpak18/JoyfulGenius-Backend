// routes/testRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateRequest as validate } from "../middleware/validateRequest.js";
import { submitTest } from "../controllers/testController.js";
import { submitTestSchema } from "../validation/testSchemas.js";

const router = express.Router();

// Submit + auto-save (and enforce attempts if Chapter has attemptLimit)
router.post("/submit", protect, validate(submitTestSchema), submitTest);

export default router;
