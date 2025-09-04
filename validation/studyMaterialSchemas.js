import { z } from "zod";
import mongoose from "mongoose";

const objectId = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId"
});

export const createMaterialSchema = {
  body: z.object({
    courseId: objectId,
    subjectId: objectId,
    chapterId: objectId,
    title: z.string().trim().min(1, "Title is required"),
    type: z.enum(["pdf", "video", "youtube"]),
    downloadable: z
      .union([z.boolean(), z.string().transform((val) => val === "true")])
      .optional()
      .default(false),
    youtubeLink: z
      .string()
      .trim()
      .url("Invalid YouTube link")
      .optional()
      .or(z.literal("").transform(() => undefined))
  }).refine((data) => {
    if (data.type === "youtube") {
      return !!data.youtubeLink;
    }
    return true;
  }, {
    message: "youtubeLink is required when type is 'youtube'",
    path: ["youtubeLink"]
  })
};

export const getMaterialSchema = {
  params: z.object({
    id: objectId
  })
};

export const streamMaterialSchema = {
  params: z.object({
    id: objectId
  })
};

export const downloadMaterialSchema = {
  params: z.object({
    id: objectId
  })
};

export const deleteMaterialSchema = {
  params: z.object({
    id: objectId
  })
};
