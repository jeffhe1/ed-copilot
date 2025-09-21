// lib/schemas.ts
import { z } from "zod";
import { AREAS, SUBJECTS, TOPICS } from "./taxonomy";

export const QuestionGenSchema = z.object({
  prompt: z.string().min(10),
  correctAnswer: z.union([z.string(), z.number()]),
  choices: z.array(z.union([z.string(), z.number()])).optional(), // MCQ optional
  explanation: z.string().min(5).optional(),
  area: z.enum(AREAS),
  subject: z.string(),
  topic: z.string(),
  skillIds: z.array(z.string()).nonempty(),    // e.g. ["calculus.derivative.rules"]
  difficulty: z.number().int().min(1).max(5).optional()
}).refine((o)=> SUBJECTS[o.area]?.includes(o.subject), { message:"subject not in area" })
  .refine((o)=> (TOPICS[o.subject]||[]).includes(o.topic), { message:"topic not in subject" });

export type QuestionGen = z.infer<typeof QuestionGenSchema>;
