import { notFound, redirect } from "next/navigation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The other half of the `/events/[id]` shim.
 *
 * An event plan's edit screen moved to `/events/plans/[id]/edit` along with the
 * plan itself, but `/events/<uuid>/edit` is what a browser tab left open across
 * the deploy still points at. A catalog entry has no edit page here at all —
 * the board edits recurring events on `/admin/board/event-catalog` — so
 * anything that isn't a plan UUID is simply not a page.
 */
export default async function EventEditShimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (UUID_RE.test(slug)) redirect(`/events/plans/${slug}/edit`);
  notFound();
}
