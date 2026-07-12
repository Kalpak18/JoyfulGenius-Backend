// validation/courseSchemas.js
import { z } from "zod";

const optionalString = z.string().optional();
const optionalUrl    = z.string().url().or(z.literal("")).optional();

const courseBody = {
  name:            optionalString,
  slug:            optionalString,
  description:     optionalString,
  language:        optionalString,
  thumbnailUrl:    optionalUrl,
  priceINR:        z.number().nonnegative().optional(),
  discountINR:     z.number().nonnegative().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  hasPlayer:       z.boolean().optional(),
  status:          z.enum(["draft", "published", "archived"]).optional(),
  validityDays:    z.number().int().positive().nullable().optional(),
  courseType:      z.enum(["standard", "test_series"]).optional(),
};

export const createCourseSchema = z.object({
  body: z.object({
    ...courseBody,
    name: z.string().min(3, "Course name must be at least 3 characters long"),
  }),
});

export const updateCourseSchema = z.object({
  params: z.object({
    courseId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid course ID"),
  }),
  body: z.object(courseBody),
});

export const enrollUserSchema = z.object({
  body: z.object({
    courseId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid course ID"),
    userId:   z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID"),
  }),
});

export const deleteCourseSchema = z.object({
  params: z.object({
    courseId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid course ID"),
  }),
});
