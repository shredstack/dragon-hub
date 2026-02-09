import { getArticleBySlug } from "@/actions/knowledge";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, ExternalLink, Calendar, User } from "lucide-react";
import { getCurrentUser, getCurrentSchoolId, isSchoolPtaBoardOrAdmin } from "@/lib/auth-helpers";
import { DeleteArticleButton } from "@/components/knowledge/delete-article-button";
import { ArticleRenderer } from "@/components/knowledge/article-renderer";
import { PublishButton } from "@/components/knowledge/publish-button";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;

  const article = await getArticleBySlug(slug);
  if (!article) {
    notFound();
  }

  const user = await getCurrentUser();
  const schoolId = await getCurrentSchoolId();
  const isPtaBoard = user?.id && schoolId
    ? await isSchoolPtaBoardOrAdmin(user.id, schoolId)
    : false;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back link */}
      <Link
        href="/knowledge"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Knowledge Base
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold sm:text-3xl">{article.title}</h1>
              <StatusBadge status={article.status} />
              {article.aiGenerated && (
                <Badge variant="secondary">AI Generated</Badge>
              )}
            </div>
            {article.summary && (
              <p className="text-muted-foreground">{article.summary}</p>
            )}
          </div>

          {isPtaBoard && (
            <div className="flex items-center gap-2">
              {article.status === "draft" && (
                <PublishButton slug={article.slug} />
              )}
              <Link
                href={`/knowledge/${article.slug}/edit`}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-transparent px-3 text-xs font-medium shadow-sm transition-colors hover:bg-muted hover:text-foreground"
              >
                <Edit className="h-4 w-4" />
                Edit
              </Link>
              <DeleteArticleButton
                articleSlug={article.slug}
                articleTitle={article.title}
                redirectAfterDelete
              />
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {article.creator && (
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {article.creator.name}
            </span>
          )}
          {article.publishedAt && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Published {new Date(article.publishedAt).toLocaleDateString()}
            </span>
          )}
          {article.schoolYear && (
            <span>School Year: {article.schoolYear}</span>
          )}
          {article.googleDriveUrl && (
            <a
              href={article.googleDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              Google Drive
            </a>
          )}
        </div>

        {/* Tags */}
        {(article.category || (article.tags && article.tags.length > 0)) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {article.category && (
              <Badge variant="secondary">{article.category}</Badge>
            )}
            {article.tags?.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Source minutes link */}
        {article.sourceMinutes && (
          <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              Extracted from meeting minutes:{" "}
              <Link
                href={`/minutes/${article.sourceMinutes.id}`}
                className="font-medium text-primary hover:underline"
              >
                {article.sourceMinutes.fileName}
              </Link>
              {article.sourceMinutes.meetingDate && (
                <span className="ml-1">
                  ({new Date(article.sourceMinutes.meetingDate).toLocaleDateString()})
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Article Body */}
      <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
        <ArticleRenderer content={article.body} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${variants[status] || variants.draft}`}
    >
      {status}
    </span>
  );
}
