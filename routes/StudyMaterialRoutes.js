import express from "express";
import multer from "multer";
import upload from "../middleware/Upload.js";
import {
  createMaterial,
  listMaterials,
  getMaterial,
  streamMaterial,
  downloadMaterial,
  deleteMaterial
} from "../controllers/StudyMaterialController.js";
import { validateRequest as validate } from "../middleware/validateRequest.js";
import {
  createMaterialSchema,
  getMaterialSchema,
  streamMaterialSchema,
  downloadMaterialSchema,
  deleteMaterialSchema
} from "../validation/studyMaterialSchemas.js";
import { verifyAdmin } from "../middleware/auth.js";
import handleMulterError from "../middleware/HandleMulterError.js";

// const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Create
router.post(
  "/",
  verifyAdmin,
  upload.single("file"),
  validate(createMaterialSchema),
  handleMulterError,
  createMaterial
);

// List grouped materials
router.get("/", listMaterials);

// Get single material
router.get("/:id", validate(getMaterialSchema), getMaterial);

// Stream file
router.get("/:id/stream", validate(streamMaterialSchema), streamMaterial);

// Download file
router.get("/:id/download", validate(downloadMaterialSchema), downloadMaterial);

// Delete material
router.delete("/:id", verifyAdmin, validate(deleteMaterialSchema), deleteMaterial);

export default router;
