import express from 'express';
import {
  createSubject,
  listSubjects,
  getSubject,
  updateSubject,
  deleteSubject,
  getSubjectByName,
  listSubjectsGroupedByCourse
} from '../controllers/subjectController.js';
import {
  createSubjectSchema,
  updateSubjectSchema,
  getOrDeleteSubjectSchema
} from '../validation/subjectSchemas.js';
import { validateRequest as validate } from '../middleware/validateRequest.js';
import { protect, verifyAdmin } from '../middleware/auth.js';
import { requireCourseScope, requireCourseScopeBy } from '../middleware/tutorScope.js';
import { requirePaidCourse } from '../middleware/requirePaidCourse.js';

const router = express.Router();

// Subject create needs admin auth + scope check on the body's courseId.
router.post('/', verifyAdmin, requireCourseScope("courseId"), validate(createSubjectSchema), createSubject);
// courseId in query → requirePaidCourse will gate on it when present
router.get('/', protect, requirePaidCourse, listSubjects);
router.get('/grouped', listSubjectsGroupedByCourse);
router.get('/:id', validate(getOrDeleteSubjectSchema), getSubject);
router.put('/:id', verifyAdmin, requireCourseScopeBy({ kind: "subject", paramKey: "id" }), validate(updateSubjectSchema), updateSubject);
router.delete('/:id', verifyAdmin, requireCourseScopeBy({ kind: "subject", paramKey: "id" }), validate(getOrDeleteSubjectSchema), deleteSubject);
router.get("/by-name/:courseId/:subjectName", protect, requirePaidCourse, getSubjectByName);

export default router;
