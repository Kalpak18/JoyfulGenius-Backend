// validation/testResultSchemas.js
import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

export const saveTheResultSchema = z.object({
  body: z.object({
    courseId: objectId,
    chapterId: objectId,
    subjectId: objectId,
    score: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    type: z.enum(["chapter", "mock", "free","master", "manual"]).optional(),
    detailedResults: z
      .array(
        z.object({
          question: z.string(),
          options: z.array(z.string()).length(4),
          correctAnswer: z.number().int().min(0).max(3),
          userAnswer: z.number().int().min(0).max(3).nullable().optional(),
          isCorrect: z.boolean().optional(),
        })
      )
      .optional(),
  }),
});

export const getUserResultsSchema = z.object({
  query: z.object({
    courseId: objectId.optional(),
    subjectId: objectId.optional(),
    chapterId: objectId.optional(),
    testType: z.enum(["chapter", "mock", "free","master", "manual"]).optional(),
    
  }),
});

export const addManualTestByUserSchema = z.object({
  body: z.object({
    courseId: objectId,
    subjectId: objectId,
    chapterId: objectId.optional(),
    score: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
});

export const addManualTestByAdminSchema = z.object({
  body: z.object({
    userId: objectId,
    courseId: objectId,
    subjectId: objectId,
    chapterId: objectId,
    score: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
});

export const updateTestResultSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      subject: z.string().min(1).optional(),
      score: z.number().int().nonnegative().optional(),
      total: z.number().int().positive().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" }),
});

export const deleteTestResultSchema = z.object({
  params: z.object({ id: objectId }),
});
