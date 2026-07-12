// routes/builderRoutes.js
//
// Two routers exported, both mounted from index.js:
//   adminRouter   → /api/admin  (verifyAdmin + scope checks)
//   studentRouter → /api/courses (protect; tree endpoint)

import express from "express";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { requireCourseScope, requireCourseScopeBy } from "../middleware/tutorScope.js";
import {
  createSection, updateSection, deleteSection, reorderSections,
  createBlock,   updateBlock,   deleteBlock,   reorderBlocks,
  getCourseBuilderTree,
} from "../controllers/builderController.js";

export const adminRouter = express.Router();
adminRouter.use(verifyAdmin);

// Sections — courseId in body for create, scope by section doc for the rest.
adminRouter.post  ("/sections",          requireCourseScope("courseId"), createSection);
adminRouter.patch ("/sections/:id",      requireCourseScopeBy({ kind: "section", paramKey: "id" }), updateSection);
adminRouter.delete("/sections/:id",      requireCourseScopeBy({ kind: "section", paramKey: "id" }), deleteSection);
adminRouter.post  ("/sections/reorder",  requireCourseScope("courseId"), reorderSections);

// Blocks — sectionId in body for create; controller resolves the parent course
// for tutor scope check below using the block id.
adminRouter.post  ("/blocks",            createBlock);   // (scope enforced via section in the controller-level access check below)
adminRouter.patch ("/blocks/:id",        requireCourseScopeBy({ kind: "block", paramKey: "id" }), updateBlock);
adminRouter.delete("/blocks/:id",        requireCourseScopeBy({ kind: "block", paramKey: "id" }), deleteBlock);
adminRouter.post  ("/blocks/reorder",    reorderBlocks); // scoped at controller via sectionId → courseId

// Read tree from admin view (sees draft + unpublished)
adminRouter.get   ("/courses/:courseId/builder", requireCourseScope("courseId"), getCourseBuilderTree);

// Student-facing read
export const studentRouter = express.Router();
studentRouter.get("/:courseId/builder", protect, getCourseBuilderTree);
