// // routes/testResultRoutes.js
// import express from "express";
// import {
//   saveTestResult,
//   getUserTestResults,
//    addManualTestResult
// } from "../controllers/testResultController.js";
// import { verifyUser } from "../middleware/auth.js";
// import { verifyAdmin } from "../middleware/auth.js";

// const router = express.Router();

// router.post("/save", verifyUser, saveTestResult);
// router.get("/my-results", verifyUser, getUserTestResults);
// router.post("/admin/add-manual-test", verifyAdmin, addManualTestResult);
// router.post("/user/add-manual-test", verifyUser, addManualTestResult); 


// export default router;
import express from 'express';
import { verifyUser, verifyAdmin } from '../middleware/auth.js';
import { addManualTestByUser, addManualTestByAdmin, getUserTestResults, saveTheResult,deleteTestResult,updateTestResult } from '../controllers/testResultController.js';

const router = express.Router();
router.post("/save", verifyUser, saveTheResult);

router.post('/add-manual', verifyUser, addManualTestByUser); // User adds own test
router.post('/admin-add-manual', verifyAdmin, addManualTestByAdmin); // Admin adds test for any user
router.get("/my", verifyUser, getUserTestResults);// Existing route to get user's test results
router.put("/:id", verifyUser, updateTestResult); // ✅ Edit
router.delete("/:id", verifyUser, deleteTestResult); // ✅ Delete

export default router;
