// validation/otpSchemas.js
import { z } from "zod";
import { phone10 } from "./shared.js";

export const sendOtpSchema = {
  body: z.object({
    whatsappNo: phone10.or(z.string().trim().optional()),
  })
};

export const verifyOtpSchema = {
  body: z.object({
    whatsappNo: phone10.or(z.string().trim().optional()),
    code:       z.string().trim().min(4).max(8)
  })
};
