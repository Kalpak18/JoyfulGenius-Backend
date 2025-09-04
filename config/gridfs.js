// config/gridfs.js
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { env } from './validateEnv.js';

let bucket;
let initializationPromise;

const { MONGO_URI} = env;


export const initGridFS = async () => {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const client = await MongoClient.connect(MONGO_URI);
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
