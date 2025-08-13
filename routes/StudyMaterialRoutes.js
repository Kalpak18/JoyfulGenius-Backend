// routes/materials.routes.js
// routes/materials.routes.js
import { Router } from "express";
import upload from "../middleware/Upload.js";
import {
  createMaterial,
  listMaterials,
  getMaterial,
  streamMaterial,
  downloadMaterial,
  deleteMaterial,
} from "../controllers/StudyMaterialController.js"; // <- make sure filename 
// matches
import { verifyAdmin } from '../middleware/auth.js';
const router = Router();

// List all materials
router.get("/", listMaterials); // frontend calls GET /api/materials

// Create/upload material
router.post("/",verifyAdmin, upload.single("file"), createMaterial); // frontend calls POST /api/materials

// Get single material info
router.get("/:id", getMaterial);

// Stream PDF/video inline
router.get("/:id/stream", streamMaterial);

// Download (if allowed)
router.get("/:id/download", downloadMaterial);

// Delete material
router.delete("/:id", deleteMaterial);

export default router;






// import express from 'express';
// import {
//   uploadMaterial,
//   removeFile,
//   replaceFile,
//   removeYouTubeLink,
//   getFile,
//   getAllMaterials,
//   getMaterialById,
//   deleteTopic
// } from '../controllers/StudyMaterialController.js';
// import upload from '../middleware/Upload.js';
// import { verifyAdmin } from '../middleware/auth.js';

// const router = express.Router();

// // ---------------------- ADMIN ROUTES ---------------------- //
// router.post(
//   '/upload',
//   verifyAdmin,
//   upload.array('files', 10), // Max 10 files
//   uploadMaterial
// );

// router.delete('/:id/file/:fileId', verifyAdmin, removeFile);

// router.put(
//   '/:id/file/:fileId',
//   verifyAdmin,
//   upload.single('file'), // Single file for replacement
//   replaceFile
// );

// router.delete('/:id/youtube/:linkIndex', verifyAdmin, removeYouTubeLink);

// router.delete('/:id', verifyAdmin, deleteTopic);

// // ---------------------- PUBLIC ROUTES ---------------------- //
// router.get('/:id/file/:fileId', getFile);

// router.get('/', getAllMaterials); // ?courseName=&subjectName=&topicName=

// router.get('/:id', getMaterialById);

// export default router;