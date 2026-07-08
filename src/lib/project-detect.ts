/**
 * Extract a human-readable project name from a file path.
 * Handles Claude Code project paths and direct project directories.
 */
export function extractProjectFromPath(filePath: string): string | null {
  if (!filePath) return null;

  // Claude Code project path: ~/.claude/projects/-Users-sanjay-projects-ProjOTW-cortex/...
  const claudeProjectMatch = filePath.match(
    /\.claude\/projects\/-[^/]+-([^/]+)\//
  );
  if (claudeProjectMatch) {
    return humanize(claudeProjectMatch[1]);
  }

  // Direct project path: /Users/.../projects/<category>/<name> or /Users/.../projects/<name>
  const projectDirMatch = filePath.match(
    /\/projects\/(?:[^/]+\/)*([^/]+)\/?$/
  );
  if (projectDirMatch) {
    return humanize(projectDirMatch[1]);
  }

  // Also try matching intermediate project directories
  const projectsMatch = filePath.match(
    /\/projects\/(?:[^/]+\/)*([^/]+)\//
  );
  if (projectsMatch) {
    // Take the last meaningful directory name before trailing paths
    const segments = filePath.split("/projects/")[1]?.split("/").filter(Boolean) ?? [];
    const name = segments[segments.length - 1] || segments[0];
    if (name && !name.startsWith(".") && name !== "memory") {
      return humanize(name);
    }
    // Fall back to first segment after /projects/
    if (segments[0] && segments.length > 1) {
      return humanize(segments[segments.length > 2 ? segments.length - 2 : 0]);
    }
  }

  return null;
}

function humanize(slug: string): string {
  // Convert camelCase and PascalCase to spaces
  const spaced = slug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Convert kebab-case and snake_case to spaces
    .replace(/[-_]+/g, " ")
    .trim();

  // Capitalize each word
  return spaced
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
