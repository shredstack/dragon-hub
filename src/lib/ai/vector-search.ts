import { standardOrFallbackLabel } from "@/lib/board-positions-shared";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { generateEmbedding } from "./embeddings";
import { documentUrl } from "@/lib/documents/index-document";
import { truncateAtWordBoundary } from "@/lib/text-truncate";
import {
  isValidSchoolYear,
  getSchoolCurrentYear,
  getNextSchoolYear,
  getPreviousSchoolYear,
} from "@/lib/school-year";

export type SearchResultType =
  | "knowledge_article"
  | "budget_category"
  | "event_plan"
  | "fundraiser"
  | "handoff_note"
  | "drive_file"
  | "minutes";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  content: string;
  similarity: number;
  url?: string;
  metadata?: Record<string, unknown>;
  /**
   * The underlying file, for drive_file results only.
   *
   * `title` above is decorated for display ("Document: field_day_budget") and
   * `url` points at Drive or Blob storage, so neither is enough to open the
   * file in-app — the viewer needs the raw name and MIME type to decide how to
   * render it.
   */
  document?: ViewableDocumentRef;
}

/** The fields DocumentViewer needs to render a file without downloading it. */
export interface ViewableDocumentRef {
  id: string;
  fileName: string;
  title: string | null;
  mimeType: string | null;
  source: string;
  url: string | undefined;
}

export interface SemanticSearchOptions {
  limit?: number;
  sources?: SearchResultType[];
  minSimilarity?: number;
}

/**
 * Floor for what counts as a possible match.
 *
 * Calibrated against real content rather than the textbook "0.7 is a strong
 * match" figure, which does not hold for short questions searched against long
 * documents with text-embedding-3-small: the best document in the corpus for a
 * well-supported question scores around 0.53, and a budget spreadsheet holding
 * the literal answer scores 0.48. A 0.5 floor cut off almost every real
 * source. Ranking still decides what wins — this only decides what is
 * considered at all.
 */
export const DEFAULT_MIN_SIMILARITY = 0.35;

/**
 * How much of each result's text travels with it.
 *
 * This is what the assistant actually reads, so it bounds what can be
 * answered. At 500 characters a budget spreadsheet contributed its header row
 * and the first two line items — enough to prove the file is relevant, never
 * enough to say what anything cost. Callers re-slice for display, so raising
 * this only affects the answer, not the UI.
 */
const MAX_RESULT_CONTENT = 2000;

/**
 * How much a trailing result can lag the best match before it's dropped.
 *
 * Once a strong match exists, several weakly-related documents riding along
 * behind it in the same prompt is what causes the assistant to blend distinct
 * documents together in one answer (e.g. citing the wrong year's minutes for
 * a detail that only appears in the best match). This trims that tail while
 * MIN_KEPT_RESULTS still lets a genuinely ambiguous question — several
 * similar-quality matches — surface more than one source.
 */
const RELATIVE_SIMILARITY_GAP = 0.15;
const MIN_KEPT_RESULTS = 3;

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Pull an explicit "<month> <year>" out of a question, e.g. "minutes from
 * July 2026" or "what happened in our Feb 2025 meeting".
 *
 * Retrieval elsewhere in this function is pure embedding similarity, which
 * has no way to guarantee an exact month/year match wins — a vague question
 * scored against a whole-document vector can easily fall short of
 * DEFAULT_MIN_SIMILARITY even when the right document exists. This lets the
 * minutes search below force that document into the results regardless of
 * how it scores.
 */
function parseMonthYearFromQuery(
  query: string
): { month: number; year: number } | null {
  const lower = query.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const name = MONTH_NAMES[i];
    if (lower.includes(name) || lower.includes(name.slice(0, 3))) {
      return { month: i + 1, year };
    }
  }
  return null;
}

/**
 * Pull an explicit school year out of a question ("2026-2027", "2026-27",
 * "this school year", "next school year"), normalized to the canonical
 * "YYYY-YYYY" form stored in every school_year column.
 *
 * A named year is unambiguous in a way embedding similarity is not: asked
 * "who's running what for 2026-2027", a fully-written-out prior-year task
 * list is a much closer vector match for "board members in charge of
 * events" than the current year's calendar-only agenda, even though it is
 * for the wrong year entirely. When a year is named, callers below hard-
 * filter to it rather than letting similarity blend years together.
 */
async function parseSchoolYearFromQuery(
  query: string,
  schoolId: string
): Promise<string | null> {
  const lower = query.toLowerCase();

  const rangeMatch = lower.match(/\b(20\d{2})\s*[-/]\s*(\d{2,4})\b/);
  if (rangeMatch) {
    const start = rangeMatch[1];
    const endRaw = rangeMatch[2];
    const end = endRaw.length === 4 ? endRaw : start.slice(0, 2) + endRaw.padStart(2, "0");
    const candidate = `${start}-${end}`;
    if (isValidSchoolYear(candidate)) return candidate;
  }

  if (/\bnext school year\b/.test(lower)) {
    return getNextSchoolYear(await getSchoolCurrentYear(schoolId));
  }
  if (/\b(last|previous) school year\b/.test(lower)) {
    return getPreviousSchoolYear(await getSchoolCurrentYear(schoolId));
  }
  if (/\b(this|current) school year\b/.test(lower)) {
    return getSchoolCurrentYear(schoolId);
  }

  return null;
}

/**
 * Perform semantic search across multiple data sources using vector similarity.
 * Returns results ranked by similarity to the query.
 */
export async function semanticSearch(
  schoolId: string,
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 10, sources, minSimilarity = DEFAULT_MIN_SIMILARITY } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(",")}]`;
  // Use sql.raw() for the vector literal to ensure proper pgvector handling
  // This is safe because embeddings only contain numbers from OpenAI
  const embeddingLiteral = sql.raw(`'${embeddingString}'::vector`);

  console.log("[semanticSearch] Query:", query.slice(0, 50));
  console.log("[semanticSearch] Embedding length:", queryEmbedding.length);
  console.log("[semanticSearch] School ID:", schoolId);

  const schoolYearHint = await parseSchoolYearFromQuery(query, schoolId);
  console.log("[semanticSearch] School year hint:", schoolYearHint);
  // Applied as a hard filter, not a ranking nudge — see parseSchoolYearFromQuery.
  // drive_file_index is the one exception: the generic Drive-folder sync never
  // stamps school_year at all (only manual uploads do), so excluding NULL there
  // would also exclude the very documents — like a year's calendar agenda —
  // this filter exists to surface.
  const yearFilter = schoolYearHint ? sql`AND school_year = ${schoolYearHint}` : sql``;
  const yearFilterBc = schoolYearHint ? sql`AND bc.school_year = ${schoolYearHint}` : sql``;
  const yearFilterDriveFile = schoolYearHint
    ? sql`AND (school_year = ${schoolYearHint} OR school_year IS NULL)`
    : sql``;
  // knowledge_articles is the same NULL-friendly shape as drive_file_index: a
  // year-specific article (one generated from a year's minutes, or a "2025-
  // 2026 Board Tasks" list) stamps school_year, but most articles are
  // evergreen how-tos that never set it and must not be hidden by a year-
  // scoped question.
  const yearFilterArticle = schoolYearHint
    ? sql`AND (school_year = ${schoolYearHint} OR school_year IS NULL)`
    : sql``;

  const results: SearchResult[] = [];
  // Each source is queried for a full page of candidates and the winners are
  // chosen by ranking them all together below. Dividing the budget up front
  // starved the largest source — documents — so a file could be the third most
  // relevant thing in the school and still never reach the ranking step.
  const perSourceLimit = limit;

  // Search knowledge articles
  if (!sources || sources.includes("knowledge_article")) {
    try {
      const articles = await db.execute(sql`
      SELECT
        id,
        title,
        summary,
        body,
        slug,
        category,
        school_year,
        1 - (embedding <=> ${embeddingLiteral}) as similarity
      FROM knowledge_articles
      WHERE school_id = ${schoolId}
        AND embedding IS NOT NULL
        AND status = 'published'
        ${yearFilterArticle}
      ORDER BY embedding <=> ${embeddingLiteral}
      LIMIT ${perSourceLimit}
    `);

      console.log("[semanticSearch] Knowledge articles found:", articles.rows.length);
      for (const row of articles.rows) {
        const similarity = row.similarity as number;
        console.log("[semanticSearch] Article:", row.title, "similarity:", similarity);
        if (similarity >= minSimilarity) {
          results.push({
            type: "knowledge_article",
            id: row.id as string,
            title: row.title as string,
            content: truncateAtWordBoundary((row.summary || row.body) as string, MAX_RESULT_CONTENT),
            similarity,
            url: `/knowledge/${row.slug}`,
            metadata: {
              category: row.category,
              schoolYear: row.school_year,
            },
          });
        }
      }
    } catch (error) {
      console.error("[semanticSearch] Error searching knowledge articles:", error);
    }
  }

  // Search budget categories (with transaction totals)
  if (!sources || sources.includes("budget_category")) {
    const categories = await db.execute(sql`
      SELECT
        bc.id,
        bc.name,
        bc.allocated_amount,
        bc.school_year,
        1 - (bc.embedding <=> ${embeddingLiteral}) as similarity,
        COALESCE(
          (SELECT SUM(amount::numeric) FROM budget_transactions WHERE category_id = bc.id),
          0
        ) as total_spent
      FROM budget_categories bc
      WHERE bc.school_id = ${schoolId}
        AND bc.embedding IS NOT NULL
        ${yearFilterBc}
      ORDER BY bc.embedding <=> ${embeddingLiteral}
      LIMIT ${perSourceLimit}
    `);

    for (const row of categories.rows) {
      const similarity = row.similarity as number;
      if (similarity >= minSimilarity) {
        results.push({
          type: "budget_category",
          id: row.id as string,
          title: `Budget: ${row.name} (${row.school_year})`,
          content: `Allocated: $${row.allocated_amount || "0"}, Spent: $${row.total_spent || "0"}`,
          similarity,
          url: `/budget`,
          metadata: {
            allocatedAmount: row.allocated_amount,
            totalSpent: row.total_spent,
            schoolYear: row.school_year,
          },
        });
      }
    }
  }

  // Search event plans
  if (!sources || sources.includes("event_plan")) {
    const events = await db.execute(sql`
      SELECT
        id,
        title,
        description,
        event_type,
        budget,
        school_year,
        status,
        location,
        event_date,
        1 - (embedding <=> ${embeddingLiteral}) as similarity
      FROM event_plans
      WHERE school_id = ${schoolId}
        AND embedding IS NOT NULL
        ${yearFilter}
      ORDER BY embedding <=> ${embeddingLiteral}
      LIMIT ${perSourceLimit}
    `);

    for (const row of events.rows) {
      const similarity = row.similarity as number;
      if (similarity >= minSimilarity) {
        results.push({
          type: "event_plan",
          id: row.id as string,
          title: `Event: ${row.title}`,
          content: truncateAtWordBoundary((row.description || `${row.event_type} event`) as string, MAX_RESULT_CONTENT),
          similarity,
          url: `/events/plans/${row.id}`,
          metadata: {
            eventType: row.event_type,
            budget: row.budget,
            schoolYear: row.school_year,
            status: row.status,
            location: row.location,
            eventDate: row.event_date,
          },
        });
      }
    }
  }

  // Search fundraisers
  if (!sources || sources.includes("fundraiser")) {
    const fundraisersResults = await db.execute(sql`
      SELECT
        f.id,
        f.name,
        f.goal_amount,
        f.start_date,
        f.end_date,
        1 - (f.embedding <=> ${embeddingLiteral}) as similarity,
        (SELECT total_raised FROM fundraiser_stats
         WHERE fundraiser_id = f.id
         ORDER BY snapshot_time DESC LIMIT 1) as total_raised
      FROM fundraisers f
      WHERE f.school_id = ${schoolId}
        AND f.embedding IS NOT NULL
      ORDER BY f.embedding <=> ${embeddingLiteral}
      LIMIT ${perSourceLimit}
    `);

    for (const row of fundraisersResults.rows) {
      const similarity = row.similarity as number;
      if (similarity >= minSimilarity) {
        results.push({
          type: "fundraiser",
          id: row.id as string,
          title: `Fundraiser: ${row.name}`,
          content: `Goal: $${row.goal_amount || "N/A"}, Raised: $${row.total_raised || "0"}`,
          similarity,
          url: `/fundraisers`,
          metadata: {
            goalAmount: row.goal_amount,
            totalRaised: row.total_raised,
            startDate: row.start_date,
            endDate: row.end_date,
          },
        });
      }
    }
  }

  // Search handoff notes
  if (!sources || sources.includes("handoff_note")) {
    const notes = await db.execute(sql`
      SELECT
        id,
        position,
        school_year,
        key_accomplishments,
        tips_and_advice,
        ongoing_projects,
        1 - (embedding <=> ${embeddingLiteral}) as similarity
      FROM board_handoff_notes
      WHERE school_id = ${schoolId}
        AND embedding IS NOT NULL
        ${yearFilter}
      ORDER BY embedding <=> ${embeddingLiteral}
      LIMIT ${perSourceLimit}
    `);

    for (const row of notes.rows) {
      const similarity = row.similarity as number;
      if (similarity >= minSimilarity) {
        const content = [
          row.key_accomplishments
            ? `Accomplishments: ${(row.key_accomplishments as string).slice(0, 200)}`
            : null,
          row.tips_and_advice
            ? `Tips: ${(row.tips_and_advice as string).slice(0, 200)}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        results.push({
          type: "handoff_note",
          id: row.id as string,
          title: `Handoff Notes: ${formatPosition(row.position as string)} (${row.school_year})`,
          content: content || "Board handoff notes",
          similarity,
          url: `/onboarding`,
          metadata: {
            position: row.position,
            schoolYear: row.school_year,
          },
        });
      }
    }
  }

  // Search drive files
  if (!sources || sources.includes("drive_file")) {
    const files = await db.execute(sql`
      SELECT
        id,
        file_name,
        title,
        coalesce(title, file_name) as display_name,
        mime_type,
        text_content,
        file_id,
        integration_name,
        source,
        blob_url,
        web_url,
        1 - (embedding <=> ${embeddingLiteral}) as similarity
      FROM drive_file_index
      WHERE school_id = ${schoolId}
        AND embedding IS NOT NULL
        ${yearFilterDriveFile}
      ORDER BY embedding <=> ${embeddingLiteral}
      LIMIT ${perSourceLimit}
    `);

    for (const row of files.rows) {
      const similarity = row.similarity as number;
      if (similarity >= minSimilarity) {
        const source = row.source as string;
        const url = documentUrl(row as Record<string, string | null>);
        results.push({
          type: "drive_file",
          id: row.id as string,
          title: `${sourceLabel(source)}: ${row.display_name}`,
          content: truncateAtWordBoundary((row.text_content as string) || "", MAX_RESULT_CONTENT),
          similarity,
          url,
          metadata: {
            integrationName: row.integration_name,
            source,
          },
          document: {
            id: row.id as string,
            fileName: row.file_name as string,
            title: (row.title as string | null) ?? null,
            mimeType: (row.mime_type as string | null) ?? null,
            source,
            url,
          },
        });
      }
    }
  }

  // Search PTA minutes.
  //
  // This table has its own clean meeting_month/meeting_year columns and the
  // full (un-truncated-by-a-generic-indexer) text of the document, but until
  // now semanticSearch never queried it at all — a minutes Google Doc only
  // ever reached Ask DragonHub through the unrelated Drive-folder indexer
  // above, truncated harder and with no date metadata attached.
  if (!sources || sources.includes("minutes")) {
    try {
      const buildMinutesResult = (
        row: Record<string, unknown>,
        similarity: number
      ): SearchResult => {
        const monthLabel =
          row.meeting_month &&
          (row.meeting_month as number) >= 1 &&
          (row.meeting_month as number) <= 12
            ? MONTH_NAMES[(row.meeting_month as number) - 1]
            : null;
        const dateLabel = row.meeting_date
          ? (row.meeting_date as string)
          : monthLabel && row.meeting_year
            ? `${monthLabel} ${row.meeting_year}`
            : (row.file_name as string);

        return {
          type: "minutes",
          id: row.id as string,
          title: `Minutes: ${capitalize(dateLabel)} (${row.school_year})`,
          content: truncateAtWordBoundary((row.text_content as string) || "", MAX_RESULT_CONTENT),
          similarity,
          url: `/minutes/${row.id}`,
          metadata: {
            fileName: row.file_name,
            meetingDate: row.meeting_date,
            schoolYear: row.school_year,
          },
        };
      };

      const dateHint = parseMonthYearFromQuery(query);

      // A direct metadata match, forced in at maximum confidence regardless
      // of the embedding score. The tables and agenda items that make up most
      // of a minutes document dilute the average vector for a vague question
      // like "minutes from July 2026" well below the similarity floor even
      // though the answer is a straightforward month/year lookup.
      if (dateHint) {
        const dateMatches = await db.execute(sql`
          SELECT id, file_name, meeting_date, meeting_month, meeting_year, school_year, text_content
          FROM pta_minutes
          WHERE school_id = ${schoolId}
            AND archived_at IS NULL
            AND meeting_month = ${dateHint.month}
            AND meeting_year = ${dateHint.year}
          LIMIT 5
        `);
        for (const row of dateMatches.rows) {
          results.push(buildMinutesResult(row as Record<string, unknown>, 1));
        }
      }

      const minutesRows = await db.execute(sql`
        SELECT id, file_name, meeting_date, meeting_month, meeting_year, school_year, text_content,
          1 - (embedding <=> ${embeddingLiteral}) as similarity
        FROM pta_minutes
        WHERE school_id = ${schoolId}
          AND archived_at IS NULL
          AND embedding IS NOT NULL
          ${yearFilter}
        ORDER BY embedding <=> ${embeddingLiteral}
        LIMIT ${perSourceLimit}
      `);

      for (const row of minutesRows.rows) {
        const similarity = row.similarity as number;
        if (similarity >= minSimilarity) {
          results.push(buildMinutesResult(row as Record<string, unknown>, similarity));
        }
      }
    } catch (error) {
      console.error("[semanticSearch] Error searching minutes:", error);
    }
  }

  // Sort all results by similarity and take top N
  console.log("[semanticSearch] Total results before filtering:", results.length);
  console.log("[semanticSearch] Results by type:", results.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>));
  if (results.length > 0) {
    console.log("[semanticSearch] Top similarity scores:", results.slice(0, 5).map(r => ({ type: r.type, title: r.title.slice(0, 30), similarity: r.similarity })));
  }

  // A metadata-forced match and its own vector-similarity hit are the same
  // document under two different confidence scores — never cite it twice.
  const deduped = new Map<string, SearchResult>();
  for (const r of results) {
    const key = `${r.type}:${r.id}`;
    const existing = deduped.get(key);
    if (!existing || r.similarity > existing.similarity) deduped.set(key, r);
  }
  const pool = Array.from(deduped.values()).sort((a, b) => b.similarity - a.similarity);

  if (pool.length === 0) return [];

  const best = pool[0].similarity;
  const filtered = pool.filter(
    (r, i) => i < MIN_KEPT_RESULTS || r.similarity >= best - RELATIVE_SIMILARITY_GAP
  );

  return filtered.slice(0, limit);
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

// Documents in the index come from three places; the label tells the user
// where a result lives so "Drive:" doesn't mislabel a direct upload.
function sourceLabel(source: string): string {
  if (source === "upload") return "Document";
  if (source === "drive_link") return "Shared Doc";
  return "Drive";
}

// Board positions are school-defined, and this runs without a school in
// scope, so fall back to the standard labels. See board-positions-shared.
const formatPosition = standardOrFallbackLabel;
