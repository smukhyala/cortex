import { z } from "zod";

export const ContextDestinationSchema = z.enum([
  "claude_code",
  "claude_desktop",
  "claude_export",
  "poke",
  "chatgpt",
]);
export type ContextDestination = z.infer<typeof ContextDestinationSchema>;

export const ContextMemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string(),
  subject: z.string(),
  confidence: z.number(),
  temporality: z.string(),
  sensitive: z.boolean(),
  referenceCount: z.number(),
  updatedAt: z.string(),
  lastReferencedAt: z.string(),
});
export type ContextMemory = z.infer<typeof ContextMemorySchema>;

export const ContextGroupSchema = z.object({
  category: z.string(),
  label: z.string(),
  memories: z.array(ContextMemorySchema),
});
export type ContextGroup = z.infer<typeof ContextGroupSchema>;

export const ContextBundleSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  destination: ContextDestinationSchema.optional(),
  memoryCount: z.number(),
  omittedSensitiveCount: z.number(),
  groups: z.array(ContextGroupSchema),
  markdown: z.string(),
  prompt: z.string(),
});
export type ContextBundle = z.infer<typeof ContextBundleSchema>;
