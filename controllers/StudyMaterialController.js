import StudyMaterial from "../models/StudyMaterial.js";
import { getBucket } from "../config/gridfs.js";
import mongoose from "mongoose";

const bucket = await getBucket();

// 1. Upload/Update Material (Combined Endpoint)
export const uploadMaterial = async (req, res) => {
  try {
    const { courseName, subjectName, topicName, youtubeLinks, materialId, allowDownload } = req.body;
    const files = req.files || [];

    // Process file uploads
    const uploadedFiles = await Promise.all(
      files.map(file => 
        new Promise((resolve, reject) => {
          const uploadStream = bucket.openUploadStream(file.originalname, {
            contentType: file.mimetype,
            metadata: { allowDownload: allowDownload === "true" }
          });

          uploadStream.on('finish', () => resolve({
            fileId: uploadStream.id,
            fileName: file.originalname,
            mimeType: file.mimetype,
            fileType: file.mimetype.split('/')[0],
            allowDownload: allowDownload === "true",
            size: file.size
          }));
          
          uploadStream.on('error', reject);
          uploadStream.end(file.buffer);
        })
      )
    );

    // Process YouTube links
    const ytLinksArray = youtubeLinks
      ? Array.isArray(youtubeLinks) ? youtubeLinks : youtubeLinks.split(',')
      : [];

    let material;

    if (materialId) {
      // Update existing material
      material = await StudyMaterial.findById(materialId);
      if (!material) return res.status(404).json({ error: "Material not found" });

      // Update metadata
      material.courseName = courseName || material.courseName;
      material.subjectName = subjectName || material.subjectName;
      material.topicName = topicName || material.topicName;

      // Add new files/links
      if (uploadedFiles.length) material.files.push(...uploadedFiles);
      if (ytLinksArray.length) material.youtubeLinks.push(...ytLinksArray.filter(l => !material.youtubeLinks.includes(l)));

    } else {
      // Create new material
      material = new StudyMaterial({
        courseName,
        subjectName,
        topicName,
        files: uploadedFiles,
        youtubeLinks: ytLinksArray
      });
    }

    await material.save();
    res.json({ success: true, material });

  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// 2. Delete Single File
export const removeFile = async (req, res) => {
  try {
    const { id, fileId } = req.params;
    
    const material = await StudyMaterial.findById(id);
    if (!material) return res.status(404).json({ error: "Material not found" });

    const file = material.files.id(fileId);
    if (!file) return res.status(404).json({ error: "File not found" });

    // Delete from GridFS
    await bucket.delete(new mongoose.Types.ObjectId(file.fileId));
    
    // Remove from MongoDB document
    material.files.pull(fileId);
    await material.save();

    res.json({ success: true });

  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
};

// 3. Replace Single File
export const replaceFile = async (req, res) => {
  try {
    const { id, fileId } = req.params;
    const newFile = req.file;
    
    const material = await StudyMaterial.findById(id);
    if (!material) return res.status(404).json({ error: "Material not found" });

    const oldFile = material.files.id(fileId);
    if (!oldFile) return res.status(404).json({ error: "File not found" });

    // Delete old file
    await bucket.delete(new mongoose.Types.ObjectId(oldFile.fileId));

    // Upload new file
    const uploadStream = bucket.openUploadStream(newFile.originalname, {
      contentType: newFile.mimetype,
      metadata: { allowDownload: oldFile.allowDownload }
    });
    uploadStream.end(newFile.buffer);

    // Update file reference
    oldFile.fileId = uploadStream.id;
    oldFile.fileName = newFile.originalname;
    oldFile.mimeType = newFile.mimetype;
    oldFile.size = newFile.size;

    await material.save();
    res.json({ success: true, material });

  } catch (err) {
    console.error("Replace Error:", err);
    res.status(500).json({ error: "Failed to replace file" });
  }
};

// 4. Delete YouTube Link
export const removeYouTubeLink = async (req, res) => {
  try {
    const { id, linkIndex } = req.params;
    
    const material = await StudyMaterial.findById(id);
    if (!material) return res.status(404).json({ error: "Material not found" });

    if (linkIndex < 0 || linkIndex >= material.youtubeLinks.length) {
      return res.status(400).json({ error: "Invalid link index" });
    }

    material.youtubeLinks.splice(linkIndex, 1);
    await material.save();

    res.json({ success: true });

  } catch (err) {
    console.error("YouTube Link Error:", err);
    res.status(500).json({ error: "Failed to remove link" });
  }
};

// 5. Stream File (View/Download)
export const getFile = async (req, res) => {
  try {
    const { id, fileId } = req.params;
    
    const material = await StudyMaterial.findById(id);
    if (!material) return res.status(404).json({ error: "Material not found" });

    const file = material.files.id(fileId);
    if (!file) return res.status(404).json({ error: "File not found" });

    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(file.fileId));

    // Set headers based on download permission
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': file.allowDownload 
        ? `attachment; filename="${file.fileName}"` 
        : 'inline'
    });

    downloadStream.pipe(res);

  } catch (err) {
    console.error("Stream Error:", err);
    res.status(500).json({ error: "Failed to stream file" });
  }
};

// 6. Get All Materials (Filterable)
export const getAllMaterials = async (req, res) => {
  try {
    const { courseName, subjectName, topicName } = req.query;
    const filter = {};
    
    if (courseName) filter.courseName = courseName;
    if (subjectName) filter.subjectName = subjectName;
    if (topicName) filter.topicName = topicName;

    const materials = await StudyMaterial.find(filter)
      .sort({ uploadedAt: -1 });

    res.json({ success: true, materials });

  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch materials" });
  }
};

// 7. Get Single Material
export const getMaterialById = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) return res.status(404).json({ error: "Material not found" });
    res.json({ success: true, material });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch material" });
  }
};

// 8. Delete Entire Topic
export const deleteTopic = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) return res.status(404).json({ error: "Material not found" });

    // Delete all files from GridFS
    await Promise.all(
      material.files.map(file => 
        bucket.delete(new mongoose.Types.ObjectId(file.fileId))
      )
    );

    // Delete document
    await material.deleteOne();
    res.json({ success: true });

  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Failed to delete topic" });
  }
};