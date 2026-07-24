"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { hubBreadcrumbs } from "@/lib/admin-nav";
import { withRestoreFlag } from "@/lib/page-memory";

/**
 * The way back out of a page you reached from a hub. Rendered once per route
 * group's layout, so every page under it gets one — including pages added
 * later — and the trail comes from the same route map that builds the hub
 * grid, so a card and its back link can't disagree.
 *
 * Links carry the restore flag so landing back on the hub (or on a list you
 * drilled into) puts you where you were instead of at the top.
 */
export function HubBreadcrumb() {
  const pathname = usePathname();
  const crumbs = hubBreadcrumbs(pathname);

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-0.5 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="mx-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <Link
              href={withRestoreFlag(crumb.href)}
              className="inline-flex items-center gap-1 rounded px-1 py-1.5 transition-colors hover:text-foreground hover:underline"
            >
              {/* The arrow sits inside the link so the whole "one level up"
                  target is comfortably tappable on a phone. */}
              {index === 0 && <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />}
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
