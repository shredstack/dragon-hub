"use server";

import { db } from "@/lib/db";
import {
  knowledgeArticles,
  budgetCategories,
  eventPlans,
  fundraisers,
  boardHandoffNotes,
  driveFileIndex,
} from "@/lib/db/schema";
import { generateEmbedding } from "@/lib/ai/embeddings";
import {
  formatKnowledgeArticleForEmbedding,
  formatBudgetCategoryForEmbedding,
  formatEventPlanForEmbedding,
  formatFundraiserForEmbedding,
  formatHandoffNoteForEmbedding,
  formatDriveFileForEmbedding,
} from "@/lib/ai/embedding-formatters";
import { eq, isNull, and } from "drizzle-orm";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";

interface EmbeddingResult {
  processed: {
    knowledgeArticles: number;
    budgetCategories: number;
    eventPlans: number;
    fundraisers: number;
    handoffNotes: number;
    driveFiles: number;
  };
  total: number;
}

/**
 * Generate embeddings for all records that are missing them.
 * This should be called by admins or as a background job.
 * Processes records in batches to avoid timeouts.
 */
export async function generateMissingEmbeddings(
  batchSize: number = 20
): Promise<EmbeddingResult> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Only PTA board or admin can generate embeddings
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const result: EmbeddingResult = {
    processed: {
      knowledgeArticles: 0,
      budgetCategories: 0,
      eventPlans: 0,
      fundraisers: 0,
      handoffNotes: 0,
      driveFiles: 0,
    },
    total: 0,
  };

  // Process knowledge articles
  const articlesToProcess = await db.query.knowledgeArticles.findMany({
    where: and(
      eq(knowledgeArticles.schoolId, schoolId),
      isNull(knowledgeArticles.embedding)
    ),
    limit: batchSize,
  });

  for (const article of articlesToProcess) {
    try {
      const text = formatKnowledgeArticleForEmbedding(article);
      const embedding = await generateEmbedding(text);
      await db
        .update(knowledgeArticles)
        .set({ embedding })
        .where(eq(knowledgeArticles.id, article.id));
      result.processed.knowledgeArticles++;
    } catch (error) {
      console.error(`Failed to embed knowledge article ${article.id}:`, error);
    }
  }

  // Process budget categories
  const categoriesToProcess = await db.query.budgetCategories.findMany({
    where: and(
      eq(budgetCategories.schoolId, schoolId),
      isNull(budgetCategories.embedding)
    ),
    limit: batchSize,
  });

  for (const category of categoriesToProcess) {
    try {
      const text = formatBudgetCategoryForEmbedding({
        name: category.name,
        allocatedAmount: category.allocatedAmount,
        schoolYear: category.schoolYear,
      });
      const embedding = await generateEmbedding(text);
      await db
        .update(budgetCategories)
        .set({ embedding })
        .where(eq(budgetCategories.id, category.id));
      result.processed.budgetCategories++;
    } catch (error) {
      console.error(`Failed to embed budget category ${category.id}:`, error);
    }
  }

  // Process event plans
  const eventsToProcess = await db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      isNull(eventPlans.embedding)
    ),
    limit: batchSize,
  });

  for (const plan of eventsToProcess) {
    try {
      const text = formatEventPlanForEmbedding({
        title: plan.title,
        description: plan.description,
        eventType: plan.eventType,
        budget: plan.budget,
        schoolYear: plan.schoolYear,
        status: plan.status,
        location: plan.location,
      });
      const embedding = await generateEmbedding(text);
      await db
        .update(eventPlans)
        .set({ embedding })
        .where(eq(eventPlans.id, plan.id));
      result.processed.eventPlans++;
    } catch (error) {
      console.error(`Failed to embed event plan ${plan.id}:`, error);
    }
  }

  // Process fundraisers
  const fundraisersToProcess = await db.query.fundraisers.findMany({
    where: and(
      eq(fundraisers.schoolId, schoolId),
      isNull(fundraisers.embedding)
    ),
    limit: batchSize,
  });

  for (const fundraiser of fundraisersToProcess) {
    try {
      const text = formatFundraiserForEmbedding({
        name: fundraiser.name,
        goalAmount: fundraiser.goalAmount,
        startDate: fundraiser.startDate,
        endDate: fundraiser.endDate,
      });
      const embedding = await generateEmbedding(text);
      await db
        .update(fundraisers)
        .set({ embedding })
        .where(eq(fundraisers.id, fundraiser.id));
      result.processed.fundraisers++;
    } catch (error) {
      console.error(`Failed to embed fundraiser ${fundraiser.id}:`, error);
    }
  }

  // Process handoff notes
  const notesToProcess = await db.query.boardHandoffNotes.findMany({
    where: and(
      eq(boardHandoffNotes.schoolId, schoolId),
      isNull(boardHandoffNotes.embedding)
    ),
    limit: batchSize,
  });

  for (const note of notesToProcess) {
    try {
      const text = formatHandoffNoteForEmbedding({
        position: note.position,
        schoolYear: note.schoolYear,
        keyAccomplishments: note.keyAccomplishments,
        tipsAndAdvice: note.tipsAndAdvice,
        ongoingProjects: note.ongoingProjects,
        importantContacts: note.importantContacts,
      });
      const embedding = await generateEmbedding(text);
      await db
        .update(boardHandoffNotes)
        .set({ embedding })
        .where(eq(boardHandoffNotes.id, note.id));
      result.processed.handoffNotes++;
    } catch (error) {
      console.error(`Failed to embed handoff note ${note.id}:`, error);
    }
  }

  // Process drive files
  const filesToProcess = await db.query.driveFileIndex.findMany({
    where: and(
      eq(driveFileIndex.schoolId, schoolId),
      isNull(driveFileIndex.embedding)
    ),
    limit: batchSize,
  });

  for (const file of filesToProcess) {
    try {
      const text = formatDriveFileForEmbedding({
        fileName: file.fileName,
        textContent: file.textContent,
        integrationName: file.integrationName,
      });
      const embedding = await generateEmbedding(text);
      await db
        .update(driveFileIndex)
        .set({ embedding })
        .where(eq(driveFileIndex.id, file.id));
      result.processed.driveFiles++;
    } catch (error) {
      console.error(`Failed to embed drive file ${file.id}:`, error);
    }
  }

  result.total = Object.values(result.processed).reduce((a, b) => a + b, 0);
  return result;
}

/**
 * Get counts of records missing embeddings.
 * Useful for displaying progress in the admin UI.
 */
export async function getMissingEmbeddingCounts(): Promise<{
  knowledgeArticles: number;
  budgetCategories: number;
  eventPlans: number;
  fundraisers: number;
  handoffNotes: number;
  driveFiles: number;
  total: number;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const [articles, categories, events, fundrs, notes, files] =
    await Promise.all([
      db.query.knowledgeArticles.findMany({
        where: and(
          eq(knowledgeArticles.schoolId, schoolId),
          isNull(knowledgeArticles.embedding)
        ),
        columns: { id: true },
      }),
      db.query.budgetCategories.findMany({
        where: and(
          eq(budgetCategories.schoolId, schoolId),
          isNull(budgetCategories.embedding)
        ),
        columns: { id: true },
      }),
      db.query.eventPlans.findMany({
        where: and(
          eq(eventPlans.schoolId, schoolId),
          isNull(eventPlans.embedding)
        ),
        columns: { id: true },
      }),
      db.query.fundraisers.findMany({
        where: and(
          eq(fundraisers.schoolId, schoolId),
          isNull(fundraisers.embedding)
        ),
        columns: { id: true },
      }),
      db.query.boardHandoffNotes.findMany({
        where: and(
          eq(boardHandoffNotes.schoolId, schoolId),
          isNull(boardHandoffNotes.embedding)
        ),
        columns: { id: true },
      }),
      db.query.driveFileIndex.findMany({
        where: and(
          eq(driveFileIndex.schoolId, schoolId),
          isNull(driveFileIndex.embedding)
        ),
        columns: { id: true },
      }),
    ]);

  return {
    knowledgeArticles: articles.length,
    budgetCategories: categories.length,
    eventPlans: events.length,
    fundraisers: fundrs.length,
    handoffNotes: notes.length,
    driveFiles: files.length,
    total:
      articles.length +
      categories.length +
      events.length +
      fundrs.length +
      notes.length +
      files.length,
  };
}
