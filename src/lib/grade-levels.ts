// Shared helpers for parsing/formatting classroom grade levels.

// Helper to parse grade level for sorting
export function getGradeSortOrder(gradeLevel: string | null): number {
  if (!gradeLevel) return 999; // Unassigned goes last
  const normalized = gradeLevel.toLowerCase().trim();
  if (normalized === "k" || normalized === "kindergarten") return 0;
  if (normalized === "pre-k" || normalized === "prek") return -1;
  const numMatch = normalized.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 998; // Unknown grades before unassigned
}

// Helper to format grade level for display
export function formatGradeLevel(gradeLevel: string | null): string {
  if (!gradeLevel) return "Unassigned";
  const normalized = gradeLevel.toLowerCase().trim();
  if (normalized === "k" || normalized === "kindergarten") return "Kindergarten";
  if (normalized === "pre-k" || normalized === "prek") return "Pre-K";
  const numMatch = normalized.match(/^(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const suffix = num === 1 ? "st" : num === 2 ? "nd" : num === 3 ? "rd" : "th";
    return `${num}${suffix} Grade`;
  }
  return gradeLevel; // Return as-is if no match
}
