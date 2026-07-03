import { z } from "zod";

export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);

export const NormalizedMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.coerce.date().nullable(),
});
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

export const NormalizedConversationSchema = z.object({
  externalId: z.string(),
  title: z.string().nullable(),
  messages: z.array(NormalizedMessageSchema),
  contentHash: z.string(),
  sourceDate: z.coerce.date().nullable(),
});
export type NormalizedConversation = z.infer<typeof NormalizedConversationSchema>;
