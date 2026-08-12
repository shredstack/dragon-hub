/**
 * Exists only to give the Knowledge Base its browser-tab title. Both
 * `/knowledge` and `/knowledge/documents` are client components, which cannot
 * export metadata themselves; the detail pages under here override this with
 * the article's own title.
 */
export const metadata = { title: "Knowledge Base" };

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
