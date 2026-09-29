import { z } from "zod";

export const loginSchema = z.object({
  identity: z.string().trim().min(1, "Please enter your email/username and password."),
  password: z.string().min(1, "Please enter your email/username and password."),
  redirect: z.string().optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Please fill in all required fields."),
  // Mobile number is the account (required, can't be changed later); email is optional.
  email: z.string().trim().toLowerCase().email("Please enter a valid email.").or(z.literal("")).optional(),
  phone: z.string().trim().min(1, "Please enter your mobile number."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
