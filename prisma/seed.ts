import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: "identity", name: "Identity & Profile", description: "Name, location, nationality, languages" },
  { slug: "education_career", name: "Education & Career", description: "Schools, jobs, skills, certifications" },
  { slug: "projects", name: "Projects & Startups", description: "Active projects, repos, startups" },
  { slug: "research", name: "Research & Interests", description: "Topics being explored, papers, interests" },
  { slug: "preferences", name: "Preferences & Style", description: "Tool preferences, style, likes/dislikes" },
  { slug: "goals", name: "Goals & Plans", description: "Short/long-term goals, aspirations" },
  { slug: "relationships", name: "Relationships & Contacts", description: "People, family, colleagues, contacts" },
  { slug: "writing_voice", name: "Writing Voice", description: "Communication style, tone, vocabulary" },
  { slug: "workflows", name: "Workflows & Tools", description: "How they work, processes, habits, tools" },
  { slug: "temporary", name: "Temporary Context", description: "Time-bound context, current tasks" },
];

async function main() {
  console.log("Seeding database...");

  // Categories are stored as enum values in memory records, not as a separate table.
  // This seed just logs them for reference.
  console.log("Memory categories:");
  for (const cat of CATEGORIES) {
    console.log(`  ${cat.slug}: ${cat.name} — ${cat.description}`);
  }

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
