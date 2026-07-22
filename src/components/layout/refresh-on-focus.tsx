"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Refetch the current route's server components whenever the tab comes back to
// the foreground.
//
// `revalidatePath` in a server action only clears the router cache of the tab
// that ran the action. A second tab — or another board member's browser, or a
// cron sync — leaves every other session holding data from whenever it last
// rendered, with no signal that anything changed. This closes that gap without
// anyone having to reload.
//
// `router.refresh()` re-renders on the server but preserves client state, so a
// half-filled form or an open dialog survives the refresh.

// How long the tab has to have gone untouched before a refocus is worth a
// refetch. Alt-tabbing back and forth shouldn't re-run the page's queries on
// every pass.
const MIN_INTERVAL_MS = 10_000;

export function RefreshOnFocus() {
  const router = useRouter();
  const lastRefreshedAt = useRef(Date.now());

  useEffect(() => {
    function maybeRefresh() {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastRefreshedAt.current < MIN_INTERVAL_MS) return;

      lastRefreshedAt.current = now;
      router.refresh();
    }

    // visibilitychange covers tab switching; focus covers moving between
    // windows, where the tab never became hidden. pageshow covers coming back
    // via the browser's back/forward cache — common here, since so much of the
    // app links out to Google Drive and Docs.
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    window.addEventListener("pageshow", maybeRefresh);

    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
      window.removeEventListener("pageshow", maybeRefresh);
    };
  }, [router]);

  return null;
}
