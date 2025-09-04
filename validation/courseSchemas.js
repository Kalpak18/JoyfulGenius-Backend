// validation/courseSchemas.js
import { z } from "zod";

export const createCourseSchema = z.object({
  body: z.object({
    name: z.string().min(3, "Course name must be at least 3 characters long"),
    description: z.string().min(5, "Description must be at least 5 characters long").optional(),
    language: z.string().min(2, "Language must be at least 2 characters long").optional(),
  }),
});

export const updateCourseSchema = z.object({
  params: z.object({
    courseId: z.string().min(1, "Course ID is required"),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    language: z.string().min(1).optional(),
  }),
});

export const enrollUserSchema = z.object({
  body: z.object({
    courseId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid course ID"),
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID"),
  }),
});

export const deleteCourseSchema = z.object({
  params: z.object({
    courseId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid course ID"),
  }),
});
