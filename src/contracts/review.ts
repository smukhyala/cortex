import { z } from "zod";

export const ReviewItemTypeSchema = z.enum(["new_memory", "conflict"]);
export type ReviewItemType = z.infer<typeof ReviewItemTypeSchema>;

export const ReviewStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ConflictStatusSchema = z.enum(["pending", "resolved", "dismissed"]);
export type ConflictStatus = z.infer<typeof ConflictStatusSchema>;
