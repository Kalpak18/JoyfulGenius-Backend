// routes/assignmentRoutes.js
//
// Two routers exported:
//   adminRouter    → mounted at /api/admin    (verifyAdmin)
//   studentRouter  → mounted at /api/assignments (protect)
//
// Kept in one file to keep the assignment surface area discoverable.

import express from "express";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { requireCourseScope, requireCourseScopeBy } from "../middleware/tutorScope.js";
import {
  createAssignment, adminListAssignments, adminGetAssignment,
  updateAssignment, deleteAssignment,
  adminListSubmissions, listPendingSubmissions, overrideSubmission,
  studentListAssignments, studentGetAssignment,
  studentSubmitAssignment, studentGetMySubmission,
  startQuizAssignment, submitQuizAssignment,
  addQuestionsToAssignment, removeQuestionsFromAssignment,
} from "../controllers/assignmentController.js";

export const adminRouter = express.Router();
adminRouter.use(verifyAdmin);

adminRouter.post("/assignments",                       requireCourseScope("courseId"), createAssignment);
adminRouter.get("/assignments",                        adminListAssignments);
adminRouter.get("/assignments/:id",                    requireCourseScopeBy({ kind: "assignment", paramKey: "id" }), adminGetAssignment);
adminRouter.patch("/assignments/:id",                  requireCourseScopeBy({ kind: "assignment", paramKey: "id" }), updateAssignment);
adminRouter.delete("/assignments/:id",                 requireCourseScopeBy({ kind: "assignment", paramKey: "id" }), deleteAssignment);
adminRouter.post("/assignments/:id/questions",   requireCourseScopeBy({ kind: "assignment", paramKey: "id" }), addQuestionsToAssignment);
adminRouter.delete("/assignments/:id/questions", requireCourseScopeBy({ kind: "assignment", paramKey: "id" }), removeQuestionsFromAssignment);
adminRouter.get("/assignments/:id/submissions",        requireCourseScopeBy({ kind: "assignment", paramKey: "id" }), adminListSubmissions);
// Cross-assignment pending inbox — tutors see only their queue, admins see all.
adminRouter.get("/submissions/pending",                listPendingSubmissions);
// Submission grade — courseId is derived from the submission's assignment inside the controller.
adminRouter.patch("/submissions/:subId/override",      overrideSubmission);

export const studentRouter = express.Router();
studentRouter.use(protect);

studentRouter.get("/",                  studentListAssignments);
studentRouter.get("/:id",               studentGetAssignment);
studentRouter.get("/:id/mine",          studentGetMySubmission);
studentRouter.post("/:id/submit",       studentSubmitAssignment);
studentRouter.get("/:id/start",  startQuizAssignment);
studentRouter.post("/:id/quiz",  submitQuizAssignment);
