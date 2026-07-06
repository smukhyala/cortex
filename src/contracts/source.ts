import { z } from "zod";

export const SourceTypeSchema = z.enum([
  "chatgpt_export",
  "claude_code",
  "claude_export",
  "granola",
  "poke",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SyncTriggerSchema = z.enum(["manual", "upload", "fs_watch"]);
export type SyncTrigger = z.infer<typeof SyncTriggerSchema>;

export const SOURCE_TYPE_DISPLAY: Record<string, string> = {
  chatgpt_export: "ChatGPT",
  claude_code: "Claude Code",
  claude_export: "Claude AI",
  granola: "Granola",
  poke: "Poke",
};
