// config/gridfs.js
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';

let bucket;
let initializationPromise;

export const initGridFS = async () => {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const client = await MongoClient.connect(process.env.MONGO_URI);
      const db = client.db();
      bucket = new mongoose.mongo.GridFSBucket(db, {
        bucketName: 'study_materials',
        chunkSizeBytes: 255 * 1024 // 255KB chunks
      });
      console.log('✅ GridFS initialized');
      return bucket;
    })();
  }
  return initializationPromise;
};

export const getBucket = async () => {
  if (!bucket) {
    console.log("Bucket not initialized yet, initializing...");
    await initGridFS();
  } else {
    console.log("Bucket already exists, returning existing one");
  }
  return bucket;
};
