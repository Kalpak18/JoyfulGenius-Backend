// middleware/upload.js
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/materials"); // Folder must exist or be auto-created
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".pdf") cb(null, true);
  else cb(new Error("Only PDFs are allowed"));
};

const upload = multer({ storage, fileFilter });
export default upload;

