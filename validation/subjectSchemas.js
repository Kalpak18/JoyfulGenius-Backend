import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ObjectId',
  });

export const createSubjectSchema = {
  body: z.object({
    courseId: objectId,
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().optional(),
  }),
};

export const updateSubjectSchema = {
  params: z.object({
    id: objectId,
  }),
  body: z.object({
    name: z.string().trim().min(1, 'Name is required').optional(),
    description: z.string().optional(),
  }),
};

export const getOrDeleteSubjectSchema = {
  params: z.object({
    id: objectId,
  }),
};
