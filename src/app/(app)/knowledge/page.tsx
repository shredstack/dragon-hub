"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { BookOpen, Search, Plus } from "lucide-react";
import Link from "next/link";
import { getArticles } from "@/actions/knowledge";

type Article = Awaited<ReturnType<typeof getArticles>>[number];

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("published");

  useEffect(() => {
    loadArticles();
  }, [categoryFilter, statusFilter]);

  async function loadArticles() {
    setLoading(true);
    try {
      const result = await getArticles({
        status: statusFilter as "draft" | "published" | "archived" | undefined,
        category: categoryFilter || undefined,
        search: query || undefined,
      });
      setArticles(result);
    } catch (error) {
      console.error("Failed to load articles:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadArticles();
  }

  const filteredArticles = query
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(query.toLowerCase()) ||
          a.summary?.toLowerCase().includes(query.toLowerCase()) ||
          a.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase()))
      )
    : articles;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">
            Institutional knowledge and shared resources
          </p>
        </div>
        <Link
          href="/knowledge/new"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" />
          New Article
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles..."
            className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
        >
          Search
        </button>
      </form>

      {/* Status tabs */}
      <div className="mb-4 flex gap-2 border-b border-border">
        {[
          { value: "published", label: "Published" },
          { value: "draft", label: "Drafts" },
          { value: "archived", label: "Archived" },
          { value: "", label: "All" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter("")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            !categoryFilter
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All Categories
        </button>
        {KNOWLEDGE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              categoryFilter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No articles found.</p>
          <Link
            href="/knowledge/new"
            className="mt-4 inline-flex h-9 items-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            Create your first article
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map((article) => (
            <Link
              key={article.id}
              href={`/knowledge/${article.slug}`}
              className="flex flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-semibold">{article.title}</h3>
                <StatusBadge status={article.status} />
              </div>
              {article.summary && (
                <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                  {article.summary}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-1.5">
                {article.category && (
                  <Badge variant="secondary">{article.category}</Badge>
                )}
                {article.tags?.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
                {article.tags && article.tags.length > 3 && (
                  <Badge variant="outline">+{article.tags.length - 3}</Badge>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {article.creator?.name && `By ${article.creator.name} · `}
                {article.updatedAt &&
                  new Date(article.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
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
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${variants[status] || variants.draft}`}
    >
      {status}
    </span>
  );
}
