"use client";

import Link from "next/link";
import { ArrowUpRight, ExternalLink, Settings2, Star } from "lucide-react";
import {
  linkHostname,
  type ImportantLink,
} from "@/lib/important-links-shared";
import { SmartLink } from "@/components/ui/smart-link";

/**
 * The board's short list of things families are always hunting for — the
 * volunteer application, the spirit wear store, the lunch account.
 *
 * It sits directly under the hero and is the one panel on the dashboard styled
 * to be *found* rather than scanned: gold, edge to edge, and above anything the
 * user personally owes anyone. A parent who came here to renew their volunteer
 * clearance shouldn't have to read their to-do list first.
 *
 * Board members get an inline way to edit it; everyone else never learns it's
 * configurable, which is the point.
 */
export function ImportantLinks({
  links,
  isBoardMember,
}: {
  links: ImportantLink[];
  isBoardMember: boolean;
}) {
  // Nothing curated yet. Families see nothing at all rather than an empty
  // shelf; the board sees the invitation to fill it.
  if (links.length === 0) {
    if (!isBoardMember) return null;
    return (
      <section className="rounded-2xl border border-dashed border-dragon-gold-400/60 bg-dragon-gold-400/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl bg-dragon-gold-400/20 p-2 text-dragon-gold-700">
              <Star className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Important links</h2>
              <p className="text-sm text-muted-foreground">
                Add the handful of links families ask you for every year — they
                show up right here, at the top of everyone&apos;s dashboard.
              </p>
            </div>
          </div>
          <Link
            href="/admin/board/links"
            className="inline-flex items-center gap-1.5 rounded-full bg-dragon-gold-400 px-3.5 py-1.5 text-xs font-semibold text-dragon-gold-900 transition-transform hover:scale-[1.03]"
          >
            Add links
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-dragon-gold-400/50 bg-gradient-to-br from-dragon-gold-400/15 via-card to-card p-5 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-dragon-gold-400/20 blur-3xl"
      />

      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl bg-dragon-gold-400/20 p-2 text-dragon-gold-700">
              <Star className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold">Important links</h2>
          </div>
          {isBoardMember && (
            <Link
              href="/admin/board/links"
              className="inline-flex items-center gap-1 text-sm font-medium text-dragon-blue-500 hover:text-dragon-blue-700"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <SmartLink
              key={link.id}
              id={link.id}
              url={link.url}
              openMode={link.openMode}
              title={link.title}
              iconEmoji={link.iconEmoji}
              className={`${tileClass} text-left`}
            >
              <LinkTileContent link={link} />
            </SmartLink>
          ))}
        </div>
      </div>
    </section>
  );
}

const tileClass =
  "group flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-dragon-gold-400 hover:shadow-md";

function LinkTileContent({ link }: { link: ImportantLink }) {
  return (
    <>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dragon-gold-400/15 text-xl transition-transform group-hover:scale-110"
        aria-hidden
      >
        {link.iconEmoji || "🔗"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          {/* Wraps to two lines on a phone, where the tile has the whole
              column and a title cut to "Canyons School District Volu…" is
              the thing families came here to find. One line once the tiles
              are side by side and the width is gone. */}
          <span className="text-sm font-semibold line-clamp-2 sm:line-clamp-1">
            {link.title}
          </span>
          {link.openMode === "new_tab" ? (
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </span>
        {link.description ? (
          // No `block` here: `line-clamp-*` supplies its own
          // `display: -webkit-box`, and a `display` utility alongside it wins
          // the cascade and silently turns the clamp off. Three lines on a
          // phone, where the column is narrow, and two once the tiles sit
          // side by side.
          <span className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-3 sm:line-clamp-2">
            {link.description}
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {linkHostname(link.url)}
          </span>
        )}
      </span>
    </>
  );
}
