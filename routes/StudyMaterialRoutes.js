import express from "express";
import {
  uploadMaterial,
  uploadMultipleMaterials,
  uploadVideoMaterial,
  uploadMultipleVideos,
  getMaterials,
  deleteMaterial,
  updateMaterial,
} from "../controllers/StudyMaterialController.js";
import { verifyAdmin } from "../middleware/auth.js";
import upload from "../middleware/Upload.js";

const router = express.Router();

// Single PDF or Video upload
router.post(
  "/upload",
  verifyAdmin,
  upload.single("pdf"),
  uploadMaterial
);

// 🔹 Multiple PDF upload
router.post(
  "/upload-multiple",
  verifyAdmin,
  upload.array("pdfs", 10),
  uploadMultipleMaterials
);

router.post("/video", verifyAdmin, uploadVideoMaterial);

// 🔹 Multiple video URLs upload
router.post(
  "/video-multiple",
  verifyAdmin,
  uploadMultipleVideos
);

// Read / Edit / Delete
router.get("/", getMaterials);
router.delete("/:id", verifyAdmin, deleteMaterial);
router.put("/:id", verifyAdmin, upload.single("pdf"), updateMaterial);

export default router;
