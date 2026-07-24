import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { getSchoolTagOptions } from "@/lib/tag-options";
import { NewArticleForm } from "./new-article-form";

/**
 * Server shell for the create-article form: the school's tag vocabulary is
 * read here so the picker opens with it already in hand, the same way the
 * event plan and contact forms get theirs.
 */
export default async function NewKnowledgeArticlePage() {
  const schoolId = await getCurrentSchoolId();
  const availableTags = await getSchoolTagOptions(schoolId);

  return <NewArticleForm availableTags={availableTags} />;
}
