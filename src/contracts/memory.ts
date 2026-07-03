import { z } from "zod";

export const MEMORY_CATEGORIES = [
  "identity",
  "education_career",
  "projects",
  "research",
  "preferences",
  "goals",
  "relationships",
  "writing_voice",
  "workflows",
  "temporary",
] as const;

export const MemoryCategorySchema = z.enum(MEMORY_CATEGORIES);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  identity: "Identity & Profile",
  education_career: "Education & Career",
  projects: "Projects & Startups",
  research: "Research & Interests",
  preferences: "Preferences & Style",
  goals: "Goals & Plans",
  relationships: "Relationships & Contacts",
  writing_voice: "Writing Voice",
  workflows: "Workflows & Tools",
  temporary: "Temporary Context",
};

export const TemporalitySchema = z.enum(["durable", "current", "expired"]);
export type Temporality = z.infer<typeof TemporalitySchema>;

export const MemoryStatusSchema = z.enum(["pending", "active", "rejected", "archived"]);
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;
