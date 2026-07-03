import { z } from "zod";

export const SourceTypeSchema = z.enum([
  "chatgpt_export",
  "claude_code",
  "claude_export",
  "poke",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SyncTriggerSchema = z.enum(["manual", "upload", "fs_watch"]);
export type SyncTrigger = z.infer<typeof SyncTriggerSchema>;
