// import express from 'express';
// import { saveTestResult, getUserTestResults } from '../controllers/testController.js';

// const router = express.Router();

// router.post('/test/save', saveTestResult);
// router.get('/test/history/:userId', getUserTestResults);

// export default router;
// routes/testRoutes.js
import express from "express";
import {  submitTest} from "../controllers/testController.js";
import { verifyUser } from "../middleware/auth.js";

const router = express.Router();

router.post("/submit", verifyUser, submitTest);

export default router;
