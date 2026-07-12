import { z } from "zod";

// ObjectId regex (24-char hex)
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format");

// Shared options validation
const optionsSchema = z
  .array(z.string().min(1, "Option cannot be empty"))
  .length(4, "Exactly 4 options are required");

const optionImagesSchema = z
  .array(z.string())
  .length(4)
  .optional();

const imageUrl = z.string().optional().default("");

// Add Question
export const addQuestionSchema = z.object({
  body: z.object({
    subjectId:     objectId,
    chapterId:     objectId,
    courseId:      objectId.optional(),
    question:      z.string().min(1, "Question is required"),
    questionImage: imageUrl,
    options:       optionsSchema,
    optionImages:  optionImagesSchema,
    correctAnswer: z.number().int().min(0).max(3),
    explanation:   z.string().max(2000).optional().default(""),
    course:        objectId.optional(),
  })
});

// Update Question
export const updateQuestionSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    subjectId:     objectId.optional(),
    chapterId:     objectId.optional(),
    courseId:      objectId.optional(),
    question:      z.string().min(1).optional(),
    questionImage: imageUrl,
    options:       optionsSchema.optional(),
    optionImages:  optionImagesSchema,
    correctAnswer: z.number().int().min(0).max(3).optional(),
    explanation:   z.string().max(2000).optional(),
    course:        objectId.optional(),
  })
});

// Delete Question
export const deleteQuestionSchema = z.object({
  params: z.object({
    id: objectId
  })
});

// Get Questions (filters via query)
export const getQuestionsSchema = z.object({
  query: z.object({
    subjectId: objectId.optional(),
    chapterId: objectId.optional(),
    courseId: objectId.optional()
  })
});
