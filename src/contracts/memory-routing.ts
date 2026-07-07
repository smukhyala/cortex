import { CATEGORY_LABELS, MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";

export interface CategoryMemoryToolConfig {
  category: MemoryCategory;
  name: string;
  description: string;
  triggers: string[];
}

export const CATEGORY_MEMORY_TOOLS = {
  identity: {
    category: "identity",
    name: "cortex_get_identity_profile",
    description: "Get Cortex memories about the user's identity and profile: name, background, location, age, accounts, devices, general biographical facts. Use before answering who the user is or personal profile questions.",
    triggers: ["name", "age", "location", "live", "based", "identity", "profile", "background", "bio", "device", "account"],
  },
  education_career: {
    category: "education_career",
    name: "cortex_get_education_career",
    description: "Get Cortex memories about the user's education and career: school, courses, exams, jobs, founder work, labs, professional history. Use before answering questions about studies, work, credentials, or career context.",
    triggers: ["school", "college", "class", "course", "exam", "study", "career", "job", "work", "internship", "lab", "founder"],
  },
  projects: {
    category: "projects",
    name: "cortex_get_projects_startups",
    description: "Get Cortex memories about the user's projects, startups, repositories, products, apps, experiments, and active builds. Use before answering what the user is building or project-specific questions.",
    triggers: ["project", "startup", "repo", "repository", "app", "product", "build", "building", "experiment", "launch", "feature"],
  },
  research: {
    category: "research",
    name: "cortex_get_research_interests",
    description: "Get Cortex memories about the user's research interests, papers, labs, collaborators, technical topics, and intellectual directions. Use before answering research or technical-interest questions.",
    triggers: ["research", "paper", "papers", "topic", "interest", "technical", "math", "ml", "ai", "science", "lab"],
  },
  preferences: {
    category: "preferences",
    name: "cortex_get_preferences_style",
    description: "Get Cortex memories about the user's preferences and style: likes, dislikes, favorites, naming choices, aesthetics, coding preferences, learning preferences, UI taste, and what the user would choose. Use before any question about what the user likes, wants, would name, would pick, or prefers.",
    triggers: ["prefer", "preference", "like", "dislike", "favorite", "style", "taste", "choose", "pick", "name", "naming", "aesthetic", "want"],
  },
  goals: {
    category: "goals",
    name: "cortex_get_goals_plans",
    description: "Get Cortex memories about the user's goals, plans, ambitions, next steps, future intentions, and desired outcomes. Use before planning or prioritization questions.",
    triggers: ["goal", "plan", "future", "ambition", "priority", "next", "intend", "want", "outcome", "roadmap"],
  },
  relationships: {
    category: "relationships",
    name: "cortex_get_relationships_contacts",
    description: "Get Cortex memories about the user's relationships, collaborators, friends, contacts, pets, teams, and people they know. Use before answering questions involving people in the user's life or network.",
    triggers: ["person", "people", "friend", "family", "collaborator", "contact", "team", "pet", "dog", "cat", "partner"],
  },
  writing_voice: {
    category: "writing_voice",
    name: "cortex_get_writing_voice",
    description: "Get Cortex memories about the user's writing voice, communication style, creative prose, tone preferences, and content style. Use before drafting or editing in the user's voice.",
    triggers: ["write", "writing", "voice", "tone", "draft", "edit", "email", "essay", "prose", "copy", "style"],
  },
  workflows: {
    category: "workflows",
    name: "cortex_get_workflows_tools",
    description: "Get Cortex memories about the user's workflows, tools, development setup, commands, editors, automation habits, and process preferences. Use before giving workflow, tooling, setup, or implementation advice.",
    triggers: ["workflow", "tool", "setup", "command", "editor", "automation", "process", "terminal", "code", "dev"],
  },
  temporary: {
    category: "temporary",
    name: "cortex_get_current_context",
    description: "Get Cortex memories about temporary or current context: recent status, short-term facts, active constraints, and things that may expire. Use before answering current-context questions.",
    triggers: ["current", "recent", "today", "now", "temporary", "status", "active", "deadline", "constraint", "latest"],
  },
} satisfies Record<MemoryCategory, CategoryMemoryToolConfig>;

export const CATEGORY_MEMORY_TOOL_LIST = MEMORY_CATEGORIES.map((category) => CATEGORY_MEMORY_TOOLS[category]);

export function formatMemoryToolCatalog(): string {
  return CATEGORY_MEMORY_TOOL_LIST
    .map((tool) => `- ${tool.name}: ${CATEGORY_LABELS[tool.category]} (${tool.triggers.join(", ")})`)
    .join("\n");
}
