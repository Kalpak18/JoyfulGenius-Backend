import { z } from "zod";
import { objectId } from "./shared.js";

// Create or update chapter
export const createOrUpdateChapterSchema = {
  body: z.object({
    courseId: objectId,
    subjectId: objectId,
    title: z.string().trim().min(1),
    language: z.string().trim().min(1),
    youtubeCode: z.string().trim().optional().nullable(),
    freetestCode: z.string().trim().optional().nullable(),
    mastertestCode: z.string().trim().optional().nullable(),
    attemptLimit: z.number().int().min(0).optional().nullable(), // allow 0 or null
  }),
};

// Delete chapter
export const deleteChapterSchema = {
  params: z.object({
    id: objectId,
  }),
};

// Get chapters
export const getAllChaptersSchema = {
  query: z.object({
    courseId: objectId.optional(),
    subjectId: objectId.optional(),
  }),
};
