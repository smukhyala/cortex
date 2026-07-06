import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "data/cortex.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  { slug: "identity", label: "Identity & Profile", color: "bg-blue-50 text-blue-700", sortOrder: 0 },
  { slug: "education_career", label: "Education & Career", color: "bg-purple-50 text-purple-700", sortOrder: 1 },
  { slug: "projects", label: "Projects & Startups", color: "bg-emerald-50 text-emerald-700", sortOrder: 2 },
  { slug: "research", label: "Research & Interests", color: "bg-yellow-50 text-yellow-700", sortOrder: 3 },
  { slug: "preferences", label: "Preferences & Style", color: "bg-orange-50 text-orange-700", sortOrder: 4 },
  { slug: "goals", label: "Goals & Plans", color: "bg-pink-50 text-pink-700", sortOrder: 5 },
  { slug: "relationships", label: "Relationships & Contacts", color: "bg-indigo-50 text-indigo-700", sortOrder: 6 },
  { slug: "writing_voice", label: "Writing Voice", color: "bg-cyan-50 text-cyan-700", sortOrder: 7 },
  { slug: "workflows", label: "Workflows & Tools", color: "bg-teal-50 text-teal-700", sortOrder: 8 },
  { slug: "temporary", label: "Temporary Context", color: "bg-neutral-100 text-neutral-600", sortOrder: 9 },
];

async function main() {
  console.log("Seeding database...");

  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { ...cat, isDefault: true },
    });
    console.log(`  ✓ ${cat.slug}: ${cat.label}`);
  }

  console.log(`\nSeeded ${CATEGORIES.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
