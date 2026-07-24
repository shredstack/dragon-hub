"use client";

import { useState, type ReactNode } from "react";
import { normalizeLinkUrl, type LinkOpenMode } from "@/lib/links-shared";
import {
  LinkPreviewDialog,
  type PreviewableLink,
} from "@/components/ui/link-preview-dialog";

interface SmartLinkProps {
  /** As entered by a board member — normalized here, not by the caller. */
  url: string;
  /** Which way this particular link was configured to open. */
  openMode: LinkOpenMode;
  /** Header text for the in-app dialog. Defaults to the link's own text. */
  title?: string;
  /** Header emoji for the in-app dialog. */
  iconEmoji?: string | null;
  /** Remounts the preview iframe when the same dialog shows a different link. */
  id?: string;
  className?: string;
  /** What the link looks like. Identical in both modes, on purpose. */
  children: ReactNode;
}

/**
 * One outbound link, opened the way whoever entered it chose.
 *
 * Every board-entered link in DragonHub should go through this rather than a
 * hand-written `<a target="_blank">`: it applies the same URL safety rules
 * (`normalizeLinkUrl` — these are user-entered strings landing in an `href`),
 * and it means "open this without leaving the app" is a property of the link
 * rather than a feature one screen happened to get.
 *
 * A URL that can't be normalized renders nothing at all. That case is either an
 * empty string or something that isn't a web address (`javascript:` and
 * friends), and neither should reach a page families use.
 */
export function SmartLink({
  url,
  openMode,
  title,
  iconEmoji,
  id,
  className,
  children,
}: SmartLinkProps) {
  const [open, setOpen] = useState(false);

  const href = normalizeLinkUrl(url);
  if (!href) return null;

  if (openMode !== "in_app") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  const link: PreviewableLink = {
    id,
    url: href,
    title: title || "Link",
    iconEmoji,
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <LinkPreviewDialog
        link={open ? link : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
