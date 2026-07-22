import { notFound } from "next/navigation";
import { getHuntPageData } from "@/actions/scavenger-hunts";
import { HuntBoard } from "./hunt-board";

interface PageProps {
  params: Promise<{ code: string }>;
}

/**
 * The public hunt page. Deliberately outside the `(app)` route group so it
 * bypasses the authenticated layout, sidebar, and school-cookie machinery —
 * a family scanning a QR code at the door has no account and needs none.
 */
export default async function HuntPage({ params }: PageProps) {
  const { code } = await params;
  const hunt = await getHuntPageData(code);

  if (!hunt) {
    notFound();
  }

  return <HuntBoard hunt={hunt} />;
}
