

// middleware/upload.js
import multer from 'multer';

// ✅ Memory storage so we can send buffers directly to GridFS
const storage = multer.memoryStorage();

// ✅ Allow PDFs, images, videos — YouTube links won't go through multer (no file)
const allowedTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'video/mp4'
];

const fileFilter = (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, PNG, and MP4 are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // Increased limit to 100MB for videos
});

export default upload;
