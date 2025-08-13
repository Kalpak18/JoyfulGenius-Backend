// // services/gridfs.service.js
// import { getBucket } from '../config/gridfs.js';
// import mongoose from 'mongoose';

// export const uploadFile = async (file, metadata = {}) => {
//   const bucket = getBucket();
//   return new Promise((resolve, reject) => {
//     const uploadStream = bucket.openUploadStream(file.originalname, {
//       contentType: file.mimetype,
//       metadata: { ...metadata, originalName: file.originalname }
//     });

//     uploadStream.on('finish', () => resolve(uploadStream.id));
//     uploadStream.on('error', reject);
//     uploadStream.end(file.buffer);
//   });
// };

// export const deleteFile = async (fileId) => {
//   return getBucket().delete(new mongoose.Types.ObjectId(fileId));
// };

// services/gridfs.service.js
import { getBucket } from '../config/gridfs.js';
import mongoose from 'mongoose';

/**
 * Uploads a file buffer to GridFS
 * @param {Object} file - Multer file object
 * @param {Object} metadata - Extra metadata to store
 * @returns {Promise<ObjectId>} - The GridFS file ID
 */
export const uploadFile = async (file, metadata = {}) => {
  const bucket = await getBucket(); // ✅ must await
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(file.originalname, {
      contentType: file.mimetype,
      metadata: { ...metadata, originalName: file.originalname }
    });

    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.on('error', reject);

    uploadStream.end(file.buffer);
  });
};

/**
 * Deletes a file from GridFS by ID
 * @param {string|ObjectId} fileId
 */
export const deleteFile = async (fileId) => {
  const bucket = await getBucket(); // ✅ must await
  return bucket.delete(new mongoose.Types.ObjectId(fileId));
};
