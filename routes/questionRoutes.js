// backend/routes/questionRoutes.js
import express from 'express';
import {
  addQuestion,
  getQuestions,
  updateQuestion,
  deleteQuestion,
  getQuestionMetadata,
} from '../controllers/questionController.js';

const router = express.Router();

router.post('/add', addQuestion);

router.get('/:subject/:chapter', getQuestions);

router.put('/:id', updateQuestion);

router.delete('/:id', deleteQuestion);

router.get("/all-metadata", getQuestionMetadata);
 
export default router;
