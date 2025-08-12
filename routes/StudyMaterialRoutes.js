import express from 'express';
import {
  uploadMaterial,
  removeFile,
  replaceFile,
  removeYouTubeLink,
  getFile,
  getAllMaterials,
  getMaterialById,
  deleteTopic
} from '../controllers/StudyMaterialController.js';
import upload from '../middleware/upload.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = express.Router();

// ---------------------- ADMIN ROUTES ---------------------- //
router.post(
  '/upload',
  verifyAdmin,
  upload.array('files', 10), // Max 10 files
  uploadMaterial
);

router.delete('/:id/file/:fileId', verifyAdmin, removeFile);

router.put(
  '/:id/file/:fileId',
  verifyAdmin,
  upload.single('file'), // Single file for replacement
  replaceFile
);

router.delete('/:id/youtube/:linkIndex', verifyAdmin, removeYouTubeLink);

router.delete('/:id', verifyAdmin, deleteTopic);

// ---------------------- PUBLIC ROUTES ---------------------- //
router.get('/:id/file/:fileId', getFile);

router.get('/', getAllMaterials); // ?courseName=&subjectName=&topicName=

router.get('/:id', getMaterialById);

export default router;