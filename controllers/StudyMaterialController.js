// import StudyMaterial from "../models/StudyMaterial.js";
// import fs from "fs";


// ✅ Single PDF or Video
// export const uploadMaterial = async (req, res) => {
//   try {
//     const { title, subject, type,tags, category, url } = req.body;

//     let finalUrl = url;
//     if (type === "pdf" && req.file) {
//       finalUrl = `/uploads/materials/${req.file.filename}`;
//     }

//     const newMaterial = new StudyMaterial({
//       title,
//       subject,
//       type,
//       url: finalUrl,
//       tags: tags ? JSON.parse(tags) : [],
//       category,
//       uploadedBy: req.adminId || null,
//     });

//     await newMaterial.save();
//     res.status(201).json({ message: "Uploaded", material: newMaterial });
//   } catch (err) {
//     console.error("Upload error:", err);
//     res.status(500).json({ message: "Upload failed" });
//   }
// };

// export const uploadVideoMaterial = async (req, res) => {
//   try {
//      const { title, subject, type, tags, category, url } = req.body
//     const material = new StudyMaterial({ title, subject, type,tags, category, url });
//     await material.save();
//     res.status(201).json(material);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// // ✅ Multiple PDFs
// export const uploadMultipleMaterials = async (req, res) => {
//   try {
//     const { title, subject,tags,category, type } = req.body;
//     const pdfs = req.files;

//     if (!pdfs || pdfs.length === 0) {
//       return res.status(400).json({ message: "No PDF files uploaded" });
//     }

//     const materials = await Promise.all(
//       pdfs.map((file) =>
//         new StudyMaterial({
//           title,
//           subject,
//           type,
//           url: `/uploads/materials/${file.filename}`,
//           tags: tags ? JSON.parse(tags) : [],
//       category,
//           uploadedBy: req.adminId || null,
//         }).save()
//       )
//     );

//     res.status(201).json({ message: "Multiple PDFs uploaded", materials });
//   } catch (err) {
//     console.error("Multiple upload error:", err);
//     res.status(500).json({ message: "Upload failed" });
//   }
// };

// // ✅ Multiple Video URLs
// export const uploadMultipleVideos = async (req, res) => {
//   try {
//     const { title, subject, type,tags,category, urls } = req.body;
//     const parsedUrls = Array.isArray(urls) ? urls : [urls];

//     const materials = await Promise.all(
//       parsedUrls.map((url) =>
//         new StudyMaterial({
//           title,
//           subject,
//           type,
//           url,
//           tags: tags ? JSON.parse(tags) : [],
//       category,
//           uploadedBy: req.adminId || null,
//         }).save()
//       )
//     );

//     res.status(201).json({ message: "Multiple videos saved", materials });
//   } catch (err) {
//     console.error("Video upload error:", err);
//     res.status(500).json({ message: "Upload failed" });
//   }
// };

// ✅ Get all
// export const getMaterials = async (req, res) => {
//   try {
//     const materials = await StudyMaterial.find().sort({ createdAt: -1 });
//     res.json(materials);
//   } catch (err) {
//     res.status(500).json({ message: "Failed to fetch materials" });
//   }
// };
// ✅ Delete
// export const deleteMaterial = async (req, res) => {
//   try {
//     await StudyMaterial.findByIdAndDelete(req.params.id);
//     res.json({ message: "Deleted" });
//   } catch (err) {
//     res.status(500).json({ message: "Failed to delete" });
//   }
// };

// // ✅ Edit
// export const updateMaterial = async (req, res) => {
//   try {
//     const { title, subject, type, url } = req.body;

//     // Get the existing material
//     const existing = await StudyMaterial.findById(req.params.id);
//     if (!existing) return res.status(404).json({ message: "Material not found" });

//     // Handle optional file update
//     let finalUrl = existing.url;
//     let fileChanged = false;

//     if (type === "pdf" && req.file) {
//       finalUrl = `/uploads/materials/${req.file.filename}`;
//       fileChanged = true;

//       // Optionally delete old file
//       if (existing.type === "pdf" && existing.url) {
//         const oldPath = `./${existing.url}`;
//         fs.unlink(oldPath, (err) => {
//           if (err) console.warn("Failed to delete old file:", err.message);
//         });
//       }
//     } else if (type === "url" && url) {
//       finalUrl = url;
//     }

//     const updated = await StudyMaterial.findByIdAndUpdate(
//       req.params.id,
//       {
//         title: title || existing.title,
//         subject: subject || existing.subject,
//         url: finalUrl,
//         type,
//       },
//       { new: true }
//     );

//     res.json(updated);
//   } catch (err) {
//     console.error("Update error:", err);
//     res.status(500).json({ message: "Failed to update material" });
//   }
// };




import StudyMaterial from "../models/StudyMaterial.js";
import fs from "fs";

// ✅ Single PDF or Video
export const uploadMaterial = async (req, res) => {
  try {
    const { title, subject, type, tags, category, url } = req.body;

    let finalUrl = url;
    if (type === "pdf" && req.file) {
      finalUrl = `/uploads/materials/${req.file.filename}`;
    }

    const newMaterial = new StudyMaterial({
      title,
      subject,
      type,
      url: finalUrl,
      tags: tags ? JSON.parse(tags) : [],
      category,
      uploadedBy: req.adminId || null,
    });

    await newMaterial.save();
    res.status(201).json({ message: "Uploaded", material: newMaterial });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({ 
        message: "Invalid tags format - must be valid JSON array",
        example: '["tag1","tag2"]' 
      });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation failed",
        details: Object.values(err.errors).map(e => e.message) 
      });
    }
    console.error("Upload error:", err);
    res.status(500).json({ 
      message: "Upload failed",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
};

// ✅ Video Upload
export const uploadVideoMaterial = async (req, res) => {
  try {
    const { title, subject, type, tags, category, url } = req.body;
    
    const material = new StudyMaterial({ 
      title, 
      subject, 
      type,
      url,
      tags: tags ? JSON.parse(tags) : [],
      category,
      uploadedBy: req.adminId || null
    });
    
    await material.save();
    res.status(201).json(material);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: "Tags must be valid JSON array" });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: "Validation failed",
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    res.status(500).json({ 
      error: "Video upload failed",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ✅ Multiple PDFs
export const uploadMultipleMaterials = async (req, res) => {
  try {
    const { title, subject, tags, category, type } = req.body;
    const pdfs = req.files;

    if (!pdfs || pdfs.length === 0) {
      return res.status(400).json({ message: "No PDF files uploaded" });
    }

    const materials = await Promise.all(
      pdfs.map((file) =>
        new StudyMaterial({
          title,
          subject,
          type,
          url: `/uploads/materials/${file.filename}`,
          tags: tags ? JSON.parse(tags) : [],
          category,
          uploadedBy: req.adminId || null,
        }).save()
      )
    );

    res.status(201).json({ message: "Multiple PDFs uploaded", materials });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({ message: "Invalid tags format" });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation failed",
        details: Object.values(err.errors).map(e => e.message)
      });
    }
    console.error("Multiple upload error:", err);
    res.status(500).json({ 
      message: "Upload failed",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Multiple Video URLs
export const uploadMultipleVideos = async (req, res) => {
  try {
    const { title, subject, type, tags, category, urls } = req.body;
    const parsedUrls = Array.isArray(urls) ? urls : [urls];

    const materials = await Promise.all(
      parsedUrls.map((url) =>
        new StudyMaterial({
          title,
          subject,
          type,
          url,
          tags: tags ? JSON.parse(tags) : [],
          category,
          uploadedBy: req.adminId || null,
        }).save()
      )
    );

    res.status(201).json({ message: "Multiple videos saved", materials });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({ message: "Invalid tags format" });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation failed",
        details: Object.values(err.errors).map(e => e.message)
      });
    }
    console.error("Video upload error:", err);
    res.status(500).json({ 
      message: "Upload failed",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// controllers/StudyMaterialController.js

export const getMaterials = async (req, res) => {
  try {
    const materials = await StudyMaterial.find().sort({ createdAt: -1 });
    
    // Add full URL dynamically
    const materialsWithFullUrl = materials.map(material => ({
      ...material.toObject(),
      fullUrl: `${req.protocol}://${req.get('host')}${material.url}`
    }));
    
    res.json(materialsWithFullUrl);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch materials" });
  }
};
//  ✅ Update 
export const updateMaterial = async (req, res) => {
  try {
    const { title, subject, type, category, tags, url } = req.body;

    // Get the existing material
    const existing = await StudyMaterial.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Material not found" });

    // Handle file/URL update based on type
    let finalUrl = existing.url;
    let fileChanged = false;

    if (type === "pdf" && req.file) {
      finalUrl = `/uploads/materials/${req.file.filename}`;
      fileChanged = true;
    } else if (type === "video" && url) {
      finalUrl = url;
    }

    // Delete old file if it was changed
    if (fileChanged && existing.type === "pdf" && existing.url) {
      const oldPath = `./${existing.url}`;
      fs.unlink(oldPath, (err) => {
        if (err) console.warn("Failed to delete old file:", err.message);
      });
    }

    const updated = await StudyMaterial.findByIdAndUpdate(
      req.params.id,
      {
        title: title || existing.title,
        subject: subject || existing.subject,
        type: type || existing.type,
        url: finalUrl,
        category: category || existing.category,
        tags: tags ? JSON.parse(tags) : existing.tags,
      },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ 
      message: "Failed to update material",
      error: err.message 
    });
  }
};
// ✅Delete
export const deleteMaterial = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ message: "Material not found" });
    }

    // Delete associated file if it's a PDF
    if (material.type === "pdf" && material.url) {
      const filePath = `./${material.url}`;
      fs.unlink(filePath, (err) => {
        if (err) console.warn("Failed to delete file:", err.message);
      });
    }

    await StudyMaterial.findByIdAndDelete(req.params.id);
    res.json({ 
      message: "Material deleted successfully",
      deleted: true 
    });
  } catch (err) {
    res.status(500).json({ 
      message: "Failed to delete material",
      error: err.message 
    });
  }
};
