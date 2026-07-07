import { z } from "zod";

export const ExchangeDestinationSchema = z.enum([
  "claude_code",
  "claude_desktop",
  "claude_export",
  "poke",
]);
export type ExchangeDestination = z.infer<typeof ExchangeDestinationSchema>;

export const ExchangeOriginSchema = z.enum(["claude", "poke", "manual"]);
export type ExchangeOrigin = z.infer<typeof ExchangeOriginSchema>;

export const ExchangePolicySchema = z.object({
  destination: ExchangeDestinationSchema,
  mode: z.enum(["all", "allow_only", "block"]).default("all"),
  allowedCategories: z.array(z.string()).default([]),
  blockedCategories: z.array(z.string()).default([]),
  naturalLanguageRule: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ExchangePolicy = z.infer<typeof ExchangePolicySchema>;

export interface CategoryOption {
  slug: string;
  label: string;
}

export interface MemoryForExchange {
  category: string;
  sensitive?: boolean;
}

export const ExchangeFactSchema = z.object({
  content: z.string().min(1),
  category: z.string().optional(),
  sensitive: z.boolean().default(false),
});
export type ExchangeFact = z.input<typeof ExchangeFactSchema>;

export const ExchangeIngestInputSchema = z.object({
  origin: ExchangeOriginSchema,
  facts: z.array(ExchangeFactSchema).min(1),
  topic: z.string().optional(),
  summary: z.string().optional(),
  propagate: z.boolean().default(true),
});
export type ExchangeIngestInput = z.infer<typeof ExchangeIngestInputSchema>;

export const ExchangeOrchestratorInputSchema = z.object({
  origin: ExchangeOriginSchema,
  facts: z.array(ExchangeFactSchema).min(1),
  topic: z.string().optional(),
  summary: z.string().optional(),
  propagate: z.boolean().default(true),
});
export type ExchangeOrchestratorInput = z.infer<typeof ExchangeOrchestratorInputSchema>;

export const ExchangeOrchestratorOutputSchema = z.object({
  sourceId: z.string(),
  memoriesCreated: z.number(),
  referencesUpdated: z.number(),
  conflictsCreated: z.number(),
  reviewItemsCreated: z.number(),
  propagatedDestinations: z.array(
    z.object({
      type: z.string(),
      name: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })
  ),
  skippedCategories: z.array(z.string()),
});
export type ExchangeOrchestratorOutput = z.infer<typeof ExchangeOrchestratorOutputSchema>;
