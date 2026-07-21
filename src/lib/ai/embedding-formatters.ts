/**
 * Formatters to convert database records into text suitable for embedding.
 * Each formatter creates a natural language representation of the record
 * that captures its semantic meaning for vector search.
 */

export function formatKnowledgeArticleForEmbedding(article: {
  title: string;
  summary: string | null;
  body: string;
  category: string | null;
  tags: string[] | null;
}): string {
  return [
    `Title: ${article.title}`,
    article.summary ? `Summary: ${article.summary}` : null,
    article.category ? `Category: ${article.category}` : null,
    article.tags?.length ? `Tags: ${article.tags.join(", ")}` : null,
    `Content: ${article.body.slice(0, 3000)}`, // Truncate body for embedding
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatBudgetCategoryForEmbedding(category: {
  name: string;
  allocatedAmount: string | null;
  schoolYear: string;
}): string {
  const amount = category.allocatedAmount
    ? `$${category.allocatedAmount}`
    : "no amount set";
  return `Budget category "${category.name}" for school year ${category.schoolYear} with allocated amount of ${amount}. This is a PTA budget line item for tracking expenses and allocations.`;
}

export function formatEventPlanForEmbedding(plan: {
  title: string;
  description: string | null;
  eventType: string | null;
  budget: string | null;
  schoolYear: string | null;
  status: string;
  location: string | null;
}): string {
  return [
    `Event: ${plan.title}`,
    plan.eventType ? `Type: ${plan.eventType}` : null,
    plan.description ? `Description: ${plan.description}` : null,
    plan.budget ? `Budget: ${plan.budget}` : null,
    plan.location ? `Location: ${plan.location}` : null,
    plan.schoolYear ? `School Year: ${plan.schoolYear}` : null,
    `Status: ${plan.status}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatFundraiserForEmbedding(fundraiser: {
  name: string;
  goalAmount: string | null;
  startDate: string | null;
  endDate: string | null;
}): string {
  const dateRange =
    fundraiser.startDate && fundraiser.endDate
      ? ` running from ${fundraiser.startDate} to ${fundraiser.endDate}`
      : fundraiser.startDate
        ? ` starting ${fundraiser.startDate}`
        : "";
  const goal = fundraiser.goalAmount
    ? ` with a fundraising goal of $${fundraiser.goalAmount}`
    : "";
  return `Fundraiser: "${fundraiser.name}"${dateRange}${goal}. This is a PTA fundraising campaign to raise money for school activities.`;
}

export function formatHandoffNoteForEmbedding(note: {
  position: string;
  schoolYear: string;
  keyAccomplishments: string | null;
  tipsAndAdvice: string | null;
  ongoingProjects: string | null;
  importantContacts: string | null;
}): string {
  const positionLabel = formatBoardPosition(note.position);
  return [
    `Board handoff notes for ${positionLabel} position, school year ${note.schoolYear}`,
    note.keyAccomplishments
      ? `Key accomplishments: ${note.keyAccomplishments.slice(0, 1000)}`
      : null,
    note.tipsAndAdvice
      ? `Tips and advice: ${note.tipsAndAdvice.slice(0, 1000)}`
      : null,
    note.ongoingProjects
      ? `Ongoing projects: ${note.ongoingProjects.slice(0, 500)}`
      : null,
    note.importantContacts
      ? `Important contacts: ${note.importantContacts.slice(0, 500)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDriveFileForEmbedding(file: {
  fileName: string;
  textContent: string | null;
  integrationName: string | null;
  mimeType?: string | null;
}): string {
  return [
    `Document: ${humanizeFileName(file.fileName)}`,
    `Type: ${describeFileType(file.mimeType, file.fileName)}`,
    file.integrationName ? `Source folder: ${file.integrationName}` : null,
    file.textContent
      ? `Content: ${file.textContent.slice(0, 3000)}`
      : "No text content available",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Turn a file name into words.
 *
 * "field_day_budget" embeds as an opaque token, so a question phrased as
 * "budget for field day" matches it far more weakly than it should — and for a
 * spreadsheet, whose contents are columns of amounts rather than sentences,
 * the name carries most of the meaning.
 */
function humanizeFileName(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A plain-language type label, so a grid of numbers still reads as the kind of
 * thing a question about costs or sign-ups is looking for.
 */
function describeFileType(
  mimeType: string | null | undefined,
  fileName: string
): string {
  const type = (mimeType || "").toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (type.includes("spreadsheet") || ["xlsx", "xls", "csv"].includes(ext)) {
    return "Spreadsheet with tabular data such as budgets, costs, line items, or sign-up lists";
  }
  if (type.includes("presentation") || ["pptx", "ppt"].includes(ext)) {
    return "Slide presentation";
  }
  if (type.includes("pdf") || ext === "pdf") return "PDF document";
  if (type.startsWith("image/")) return "Image or scanned handout";
  return "Document";
}

// Helper to format board position enum values for display
function formatBoardPosition(position: string): string {
  const labels: Record<string, string> = {
    president: "President",
    vice_president: "Vice President",
    secretary: "Secretary",
    treasurer: "Treasurer",
    president_elect: "President-Elect",
    vp_elect: "VP-Elect",
    legislative_vp: "Legislative VP",
    public_relations_vp: "Public Relations VP",
    membership_vp: "Membership VP",
    room_parent_vp: "Room Parent VP",
  };
  return labels[position] || position;
}
