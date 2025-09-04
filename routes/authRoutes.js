import express from "express";
import {  touchCourseEnrollment, refreshAccessToken,  logoutUser } from "../controllers/authController.js";
import{protect} from "../middleware/auth.js"
import {touchCourseEnrollmentSchema} from "../validation/adminSchemas.js"
//import {loginUserSchema} from "../validation/userSchemas.js"
import { validateRequest as validate } from "../middleware/validateRequest.js";


const router = express.Router();

// router.post("/login",validate(loginUserSchema), loginUser);
router.post("/refresh", refreshAccessToken);
router.post("/logout" , logoutUser);

router.post("/visit-course/:courseId", protect, validate(touchCourseEnrollmentSchema), touchCourseEnrollment);

export default router;
