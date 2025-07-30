import express from 'express';
import { createSubject, getSubjects } from '../controllers/subjectController.js';

const router = express.Router();

router.post('/', createSubject);
router.get('/', getSubjects);

export default router;
