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

const router = express.Router();

router.post('/', validate(createSubjectSchema), createSubject);
router.get('/', listSubjects);
router.get('/grouped', listSubjectsGroupedByCourse);
router.get('/:id', validate(getOrDeleteSubjectSchema), getSubject);
router.put('/:id', validate(updateSubjectSchema), updateSubject);
router.delete('/:id', validate(getOrDeleteSubjectSchema), deleteSubject);
router.get("/by-name/:courseId/:subjectName", getSubjectByName);

export default router;
