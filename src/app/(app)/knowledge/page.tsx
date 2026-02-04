import { db } from "@/lib/db";
import { knowledgeArticles, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { ExternalLink, BookOpen, Search } from "lucide-react";
import Link from "next/link";

interface KnowledgePageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const params = await searchParams;
  const query = params.q;
  const categoryFilter = params.category;

  let articles = await db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      description: knowledgeArticles.description,
      googleDriveUrl: knowledgeArticles.googleDriveUrl,
      category: knowledgeArticles.category,
      tags: knowledgeArticles.tags,
      schoolYear: knowledgeArticles.schoolYear,
      createdAt: knowledgeArticles.createdAt,
      creatorName: users.name,
    })
    .from(knowledgeArticles)
    .leftJoin(users, eq(knowledgeArticles.createdBy, users.id))
    .orderBy(desc(knowledgeArticles.createdAt));

  if (query) {
    articles = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.description?.toLowerCase().includes(query.toLowerCase()) ||
        a.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase()))
    );
  }

  if (categoryFilter) {
    articles = articles.filter((a) => a.category === categoryFilter);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">Institutional knowledge and shared resources</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/knowledge/generate"
            className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Generate from Drive
          </Link>
          <Link
            href="/knowledge/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
          >
            Add Article
          </Link>
        </div>
      </div>

      <form action="/knowledge" method="GET" className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search articles..."
            className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Search
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/knowledge"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${!categoryFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          All
        </Link>
        {KNOWLEDGE_CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={`/knowledge?category=${cat}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {cat}
          </Link>
        ))}
      </div>

      {articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No articles found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <div key={article.id} className="flex flex-col rounded-lg border border-border bg-card p-5">
              <div className="mb-2 flex items-start justify-between">
                <h3 className="font-semibold">{article.title}</h3>
                <a href={article.googleDriveUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              {article.description && <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{article.description}</p>}
              <div className="mt-auto flex flex-wrap gap-1.5">
                {article.category && <Badge variant="secondary">{article.category}</Badge>}
                {article.tags?.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {article.creatorName && `By ${article.creatorName} · `}
                {article.createdAt && formatDate(article.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
