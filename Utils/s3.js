// Utils/s3.js
//
// Thin wrapper around the AWS S3 SDK. Generates presigned PUT URLs so the
// browser can upload directly to S3, then sends us only the resulting URL.
//
// This is the standard professional pattern:
//   • our server never sees the file bytes (small server bill, no proxy load)
//   • browser uploads with a progress bar
//   • URL is short-lived (5 min) so leaked links can't be abused later

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import path from "path";
import { env } from "../config/validateEnv.js";

const { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_S3_PUBLIC_BASE } = env;

export const isS3Configured = () =>
  Boolean(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_S3_BUCKET);

let _client = null;
const s3 = () => {
  if (!isS3Configured()) return null;
  if (!_client) {
    _client = new S3Client({
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    });
  }
  return _client;
};

// Build the final public URL after upload. We prefer a CDN host if configured.
const publicUrl = (key) => {
  const base = (AWS_S3_PUBLIC_BASE || `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`)
    .replace(/\/+$/, "");
  return `${base}/${key}`;
};

/**
 * Generate a presigned PUT URL the client can upload to directly.
 *
 * @param {object} opts
 * @param {"video"|"image"} opts.kind        — what folder to put the file in
 * @param {string} opts.filename             — original filename (for extension only)
 * @param {string} opts.contentType          — must match what the browser sends
 * @param {number} [opts.expiresIn=300]      — seconds the URL stays valid
 * @returns { uploadUrl, publicUrl, key } or null if S3 isn't configured
 */
export async function presignUpload({ kind, filename, contentType, expiresIn = 300 }) {
  const client = s3();
  if (!client) return null;

  const ext = (path.extname(filename || "") || ".bin").toLowerCase();
  const safeKind = kind === "video" ? "videos" : kind === "thumbnail" ? "thumbnails" : "images";
  const key = `${safeKind}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${ext}`;

  const cmd = new PutObjectCommand({
    Bucket:      AWS_S3_BUCKET,
    Key:         key,
    ContentType: contentType,
    // No ACL needed — bucket policy grants public GetObject for images/, thumbnails/, videos/
  });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn });

  return { uploadUrl, publicUrl: publicUrl(key), key };
}

/** Delete an S3 object by key. Idempotent — no error if the object is missing. */
export async function deleteS3Key(key) {
  if (!key) return;
  const client = s3();
  if (!client) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key }));
  } catch (err) {
    // Don't propagate — deletion is best-effort
    console.error("S3 delete failed for key", key, err.message);
  }
}

// Allowed MIME types — keep tight. Easier to widen later than narrow.
export const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;        // 5 MB
