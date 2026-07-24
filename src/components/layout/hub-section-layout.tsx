import { HubBreadcrumb } from "@/components/admin/hub-breadcrumb";
import { ScrollMemory } from "@/components/ui/scroll-memory";

/**
 * The shell for route groups you get to from a hub rather than the sidebar
 * (see CLAUDE.md — admin tools live behind the PTA Board Hub). Those pages have
 * no other way back, so the layout gives every one of them a trail out and
 * remembers where the hub was scrolled to on the way in.
 *
 * Used as the default export of the `layout.tsx` in each such group, so adding
 * a page anywhere under one is all it takes to get this.
 */
export function HubSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScrollMemory />
      <HubBreadcrumb />
      {children}
    </>
  );
}
