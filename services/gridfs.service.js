// services/gridfs.service.js
import { getBucket } from '../config/gridfs.js';
import mongoose from 'mongoose';

export const uploadFile = async (file, metadata = {}) => {
  const bucket = getBucket();
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

export const deleteFile = async (fileId) => {
  return getBucket().delete(new mongoose.Types.ObjectId(fileId));
};