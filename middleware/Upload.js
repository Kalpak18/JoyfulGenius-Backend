// // middleware/upload.js
// import multer from "multer";
// import path from "path";

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/materials"); // Folder must exist or be auto-created
//   },
//   filename: function (req, file, cb) {
//     const uniqueName = `${Date.now()}-${file.originalname}`;
//     cb(null, uniqueName);
//   },
// });

// const fileFilter = (req, file, cb) => {
//   const ext = path.extname(file.originalname).toLowerCase();
//   if (ext === ".pdf") cb(null, true);
//   else cb(new Error("Only PDFs are allowed"));
// };

// const upload = multer({ storage, fileFilter });
// export default upload;


// middleware/Upload.js
import multer from "multer";

// Use memory storage to avoid local disk writes
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB per file, adjust if needed
  },
  fileFilter: (req, file, cb) => {
    // Allow PDFs & videos
    const allowedMimeTypes = [
      "application/pdf",
      "video/mp4",
      "video/webm",
      "video/mkv",
      "video/quicktime", // mov
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and video files are allowed"));
    }
  },
});

export default upload;
