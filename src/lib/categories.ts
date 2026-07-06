import { prisma } from "@/lib/db";

let cachedCategories: { slug: string; label: string; color: string; sortOrder: number }[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function getCategories() {
  const now = Date.now();
  if (cachedCategories && now - cacheTime < CACHE_TTL) return cachedCategories;

  const cats = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { slug: true, label: true, color: true, sortOrder: true },
  });

  cachedCategories = cats;
  cacheTime = now;
  return cats;
}

export function invalidateCategoryCache() {
  cachedCategories = null;
  cacheTime = 0;
}

export async function getCategorySlugs(): Promise<string[]> {
  const cats = await getCategories();
  return cats.map(c => c.slug);
}

export async function getCategoryLabels(): Promise<Record<string, string>> {
  const cats = await getCategories();
  return Object.fromEntries(cats.map(c => [c.slug, c.label]));
}

export async function getCategoryColors(): Promise<Record<string, string>> {
  const cats = await getCategories();
  return Object.fromEntries(cats.map(c => [c.slug, c.color]));
}
