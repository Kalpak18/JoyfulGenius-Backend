import express from 'express';
import { createChapter, getChaptersBySubject } from '../controllers/chapterController.js';

const router = express.Router();

router.post('/', createChapter);
router.get('/:subjectId', getChaptersBySubject);

export default router;
