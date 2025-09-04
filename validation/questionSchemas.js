import { z } from "zod";

// ObjectId regex (24-char hex)
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format");

// Shared options validation
const optionsSchema = z
  .array(z.string().min(1, "Option cannot be empty"))
  .length(4, "Exactly 4 options are required");

// Add Question
export const addQuestionSchema = z.object({
  body: z.object({
    subjectId: objectId,
    chapterId: objectId,
    question: z.string().min(5, "Question must be at least 5 characters long"),
    options: optionsSchema,
    correctAnswer: z
      .number()
      .int("Must be an integer")
      .min(0, "Index must be between 0 and 3")
      .max(3, "Index must be between 0 and 3"),
    course: objectId.optional()
  })
});

// Update Question
export const updateQuestionSchema = z.object({
  params: z.object({
    id: objectId
  }),
  body: z.object({
    subjectId: objectId.optional(),
    chapterId: objectId.optional(),
    question: z.string().min(5).optional(),
    options: optionsSchema.optional(),
    correctAnswer: z
      .number()
      .int()
      .min(0)
      .max(3)
      .optional(),
    course: objectId.optional()
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
