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


// import multer from "multer";

// // Store files in memory (buffer) so we can send directly to Supabase
// const storage = multer.memoryStorage();

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = [
//     "application/pdf",
//     "video/mp4",
//     "image/jpeg",
//     "image/png"
//   ];
//   if (allowedTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error("Invalid file type"), false);
//   }
// };

// // const upload = multer({ storage, fileFilter });
// const upload = multer({
//   storage,
//   fileFilter,
//   limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
// });

// export default upload;


// middleware/upload.js
import multer from 'multer';

const storage = multer.memoryStorage(); // Store files in memory

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'video/mp4'];
  cb(null, allowedTypes.includes(file.mimetype));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

export default upload;