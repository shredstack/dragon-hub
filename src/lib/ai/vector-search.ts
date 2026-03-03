import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { generateEmbedding } from "./embeddings";

export type SearchResultType =
  | "knowledge_article"
  | "budget_category"
  | "event_plan"
  | "fundraiser"
  | "handoff_note"
  | "drive_file";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  content: string;
  similarity: number;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchOptions {
  limit?: number;
  sources?: SearchResultType[];
  minSimilarity?: number;
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
  const { limit = 10, sources, minSimilarity = 0.5 } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(",")}]`;
  // Use sql.raw() for the vector literal to ensure proper pgvector handling
  // This is safe because embeddings only contain numbers from OpenAI
  const embeddingLiteral = sql.raw(`'${embeddingString}'::vector`);

  console.log("[semanticSearch] Query:", query.slice(0, 50));
  console.log("[semanticSearch] Embedding length:", queryEmbedding.length);
  console.log("[semanticSearch] School ID:", schoolId);

  const results: SearchResult[] = [];
  const perSourceLimit = Math.ceil(limit / 3); // Get more from each source, then rank globally

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
        1 - (embedding <=> ${embeddingLiteral}) as similarity
      FROM knowledge_articles
      WHERE school_id = ${schoolId}
        AND embedding IS NOT NULL
        AND status = 'published'
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
            content: ((row.summary || row.body) as string).slice(0, 500),
            similarity,
            url: `/knowledge/${row.slug}`,
            metadata: {
              category: row.category,
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
          content: ((row.description || `${row.event_type} event`) as string).slice(0, 500),
          similarity,
          url: `/events/${row.id}`,
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
        text_content,
        file_id,
        integration_name,
        1 - (embedding <=> ${embeddingLiteral}) as similarity
      FROM drive_file_index
      WHERE school_id = ${schoolId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingLiteral}
      LIMIT ${perSourceLimit}
    `);

    for (const row of files.rows) {
      const similarity = row.similarity as number;
      if (similarity >= minSimilarity) {
        results.push({
          type: "drive_file",
          id: row.id as string,
          title: `Drive: ${row.file_name}`,
          content: ((row.text_content as string) || "").slice(0, 500),
          similarity,
          url: `https://drive.google.com/file/d/${row.file_id}`,
          metadata: {
            integrationName: row.integration_name,
          },
        });
      }
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

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// Helper to format board position for display
function formatPosition(position: string): string {
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
