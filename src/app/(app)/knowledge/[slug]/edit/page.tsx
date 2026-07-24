import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentSchoolId,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { getSchoolTagOptions } from "@/lib/tag-options";
import { EditArticleForm } from "./edit-article-form";

interface EditArticlePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Board/admin gate for the edit form. `updateArticle` and the upload route
 * already reject everyone else, so this isn't the authorization boundary — but
 * an article can now be shared with a committee or a volunteer role, which means
 * people who can only READ it can reach this URL. Without the gate they'd get a
 * full editor and an upload button that error on submit.
 */
export default async function EditArticlePage({ params }: EditArticlePageProps) {
  const { slug } = await params;

  const user = await getCurrentUser();
  const schoolId = await getCurrentSchoolId();
  const isPtaBoard =
    user?.id && schoolId ? await isPtaBoardMember(user.id, schoolId) : false;

  if (!isPtaBoard) {
    redirect(`/knowledge/${slug}`);
  }

  const availableTags = await getSchoolTagOptions(schoolId);

  return <EditArticleForm availableTags={availableTags} />;
}
