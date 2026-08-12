import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getHuntPageData } from "@/actions/scavenger-hunts";
import { HuntBoard } from "./hunt-board";
import { NOT_FOUND_METADATA, getHuntMeta, shareMetadata } from "@/lib/page-metadata";

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const meta = await getHuntMeta(code);
  if (!meta) return NOT_FOUND_METADATA;
  return shareMetadata({ ...meta, path: `/hunt/${code}` });
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
