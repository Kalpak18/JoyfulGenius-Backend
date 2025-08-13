import express from 'express';
import { verifyUser, verifyAdmin } from '../middleware/auth.js';
import { addManualTestByUser, addManualTestByAdmin, getUserResults, saveTheResult,deleteTestResult,updateTestResult } from '../controllers/testResultController.js';

const router = express.Router();
router.post("/save", verifyUser, saveTheResult);

router.post('/add-manual', verifyUser, addManualTestByUser); // User adds own test
router.post('/admin-add-manual', verifyAdmin, addManualTestByAdmin); // Admin adds test for any user
router.get("/my", verifyUser, getUserResults);// Existing route to get user's test results
router.put("/:id", verifyUser, updateTestResult); // ✅ Edit
router.delete("/:id", verifyUser, deleteTestResult); // ✅ Delete

export default router;