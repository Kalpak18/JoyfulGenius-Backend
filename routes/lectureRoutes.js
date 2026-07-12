// routes/lectureRoutes.js
//
// Public student read:  GET  /api/lectures?chapterId=... (requires paid course)
// Admin writes:         POST/PATCH/DELETE  /api/admin/lectures/...
//
// We mount this twice from index.js: once at /api/lectures (read), once at
// /api/admin (write) so the path stays consistent with the rest of the app.

import express from "express";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { requireCourseScope, requireCourseScopeBy } from "../middleware/tutorScope.js";
import { requirePaidCourse } from "../middleware/requirePaidCourse.js";
import { auditLog } from "../middleware/auditLog.js";
import {
  listLectures,
  listLecturesForAdmin,
  createLecture,
  updateLecture,
  deleteLecture,
  reorderLectures,
  presignUploadController,
} from "../controllers/lectureController.js";

const studentRouter = express.Router();
studentRouter.get("/", protect, requirePaidCourse, listLectures);

const adminRouter = express.Router();
adminRouter.get   ("/lectures",          verifyAdmin, listLecturesForAdmin);
adminRouter.post  ("/lectures",          verifyAdmin, requireCourseScope("courseId"), auditLog("CREATE_LECTURE"),  createLecture);
// Reorder operates on a chapter (courseId derives from chapter) — controllers must enforce.
adminRouter.patch ("/lectures/reorder",  verifyAdmin, auditLog("REORDER_LECTURES"), reorderLectures);
adminRouter.patch ("/lectures/:id",      verifyAdmin, requireCourseScopeBy({ kind: "lecture", paramKey: "id" }), auditLog("UPDATE_LECTURE"),  updateLecture);
adminRouter.delete("/lectures/:id",      verifyAdmin, requireCourseScopeBy({ kind: "lecture", paramKey: "id" }), auditLog("DELETE_LECTURE"),  deleteLecture);
// Presign accepts any admin/tutor — the resulting S3 URL is only useful once attached to a lecture write, which IS scope-checked.
adminRouter.post  ("/uploads/presign",   verifyAdmin, presignUploadController);

export { studentRouter, adminRouter };
