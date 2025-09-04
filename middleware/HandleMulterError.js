// middleware/handleMulterError.js
export default function handleMulterError(err, req, res, next) {
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File too large. Max 100MB allowed." });
    }
    return res.status(400).json({ message: err.message || "Upload failed" });
  }
  next();
}
