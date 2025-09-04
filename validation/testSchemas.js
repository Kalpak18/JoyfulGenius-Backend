// validation/testSchemas.js
import { z } from "zod";
import { objectId } from "./shared.js";

export const submitTestSchema = {
  body: z.object({
    subject: z.string().trim().min(1, "subject is required"),
    answers: z.array(z.number().int().min(0).max(3)).nonempty("answers[] is required"),
    testType: z.enum(["chapter", "mock","free", "master"]).default("chapter"),

    // These are optional at top-level and enforced conditionally below
    courseId: objectId.optional(),
    chapterId: objectId.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.testType === "chapter") {
      if (!data.courseId) {
        ctx.addIssue({ path: ["courseId"], code: z.ZodIssueCode.custom, message: "courseId is required for chapter tests" });
      }
      if (!data.chapterId) {
        ctx.addIssue({ path: ["chapterId"], code: z.ZodIssueCode.custom, message: "chapterId is required for chapter tests" });
      }
    }
    if (data.testType === "master" && !data.courseId) {
      ctx.addIssue({ path: ["courseId"], code: z.ZodIssueCode.custom, message: "courseId is required for master tests" });
    }
  }),
};
