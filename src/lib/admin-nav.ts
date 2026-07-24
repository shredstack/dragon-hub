/**
 * The admin route map — one source of truth for the PTA Board Hub grid and for
 * the breadcrumb every admin page renders.
 *
 * Admin pages are reached through a hub (see CLAUDE.md: they deliberately
 * aren't in the sidebar), so a page with no back link is a dead end — the only
 * way out is the browser's back button, which is a poor fit on mobile. Keeping
 * the cards and the trail in the same list means adding a hub card is all it
 * takes for its page to know the way home.
 */

export interface AdminHubCard {
  label: string;
  description: string;
  href: string;
  /** Key into the icon map in `hub-sections-filter.tsx`. */
  iconName: string;
}

export interface AdminHubSection {
  title: string;
  cards: AdminHubCard[];
}

export interface AdminCrumb {
  href: string;
  label: string;
}

/** Where the board's admin pages lead back to. */
export const ADMIN_HUB: AdminCrumb = {
  href: "/admin/board",
  label: "PTA Board Hub",
};

/** Where the school-level admin pages lead back to. */
export const SCHOOL_ADMIN_HUB: AdminCrumb = {
  href: "/admin/school",
  label: "School Admin",
};

export const ADMIN_HUB_SECTIONS: AdminHubSection[] = [
  {
    title: "Getting Started",
    cards: [
      {
        label: "Board Onboarding",
        description: "Resources, checklists, and guides for your role",
        href: "/onboarding",
        iconName: "GraduationCap",
      },
      {
        label: "Board Positions",
        description:
          "Add, rename, or retire the positions your PTA runs — including ones outside the standard slate",
        href: "/admin/board/positions",
        iconName: "IdCard",
      },
    ],
  },
  {
    title: "Content",
    cards: [
      {
        label: "Important Links",
        description:
          "The links families should never have to email you for — shown at the top of everyone's dashboard",
        href: "/admin/board/links",
        iconName: "Link",
      },
      {
        label: "Manage Members",
        description: "View and manage school member directory",
        href: "/admin/members",
        iconName: "Users",
      },
      {
        label: "Manage Classrooms",
        description: "Configure classroom settings and room parents",
        href: "/admin/classrooms",
        iconName: "School",
      },
      {
        label: "Media Library",
        description: "Upload and manage images and documents",
        href: "/admin/media",
        iconName: "Image",
      },
      {
        label: "Recurring Events",
        description:
          "The events the PTA runs every year — where contacts and tips carry forward",
        href: "/admin/board/event-catalog",
        iconName: "CalendarDays",
      },
      {
        label: "Plan the Year",
        description:
          "Open this year's plan for every recurring event, then assign board leads and committee chairs",
        href: "/admin/board/event-plan-setup",
        iconName: "CalendarPlus",
      },
      {
        label: "Contact Directory",
        description:
          "Vendors and people the PTA relies on, linked to the events that use them",
        href: "/admin/contacts",
        iconName: "Contact",
      },
      {
        label: "Tags",
        description: "Manage tags for organizing content",
        href: "/admin/tags",
        iconName: "Tags",
      },
    ],
  },
  {
    title: "Secretary Tools",
    cards: [
      {
        label: "Emails",
        description: "Compose and send emails to members",
        href: "/emails",
        iconName: "Mail",
      },
      {
        label: "Meeting Agendas",
        description: "Generate and manage PTA meeting agendas",
        href: "/minutes/agenda",
        iconName: "ListChecks",
      },
    ],
  },
  {
    title: "Finance & Fundraising",
    cards: [
      {
        label: "Manage Budget",
        description: "Budget categories and transactions",
        href: "/admin/budget",
        iconName: "DollarSign",
      },
      {
        label: "Manage Fundraisers",
        description: "Create and track fundraising campaigns",
        href: "/admin/fundraisers",
        iconName: "Heart",
      },
    ],
  },
  {
    title: "Room Parent VP Tools",
    cards: [
      {
        label: "Room Parent Management",
        description: "Manage digital room parent volunteer signups",
        href: "/admin/room-parents",
        iconName: "UserPlus",
      },
      {
        label: "Sign-up Page Content",
        description:
          "Edit the wording parents see when they scan the volunteer QR code",
        href: "/admin/room-parents/signup-page",
        iconName: "Pencil",
      },
      {
        label: "Volunteer Eligibility Reminder",
        description:
          "Link new volunteers to the district application they must renew each year",
        href: "/admin/room-parents/eligibility",
        iconName: "ShieldAlert",
      },
    ],
  },
  {
    title: "Volunteer Recruiting",
    cards: [
      {
        label: "Committees",
        description:
          "Create committees and recruit volunteers with a join link",
        href: "/admin/committees",
        iconName: "Users",
      },
      {
        label: "Volunteer Campaigns",
        description:
          "QR code sign-ups for event volunteers — the digital take-home flyer",
        href: "/admin/volunteer-campaigns",
        iconName: "Megaphone",
      },
      {
        label: "Scavenger Hunt",
        description:
          "Run a QR code scavenger hunt at an event, with a live leaderboard",
        href: "/admin/scavenger-hunts",
        iconName: "Search",
      },
    ],
  },
  {
    title: "Operations",
    cards: [
      {
        label: "Onboarding Config",
        description: "Manage resources and checklist for new board members",
        href: "/admin/board/onboarding",
        iconName: "GraduationCap",
      },
      {
        label: "Approve Volunteer Hours",
        description: "Review and approve submitted hours",
        href: "/admin/volunteer-hours",
        iconName: "ShieldCheck",
      },
    ],
  },
];

interface AdminRoute extends AdminCrumb {
  /**
   * The page one level up, when it isn't the hub. Only needed where the URL
   * doesn't say it — `/admin/dli-groups` is reached from Manage Classrooms.
   */
  parent?: string;
  /** Pages that belong to School Admin rather than the board's hub. */
  root?: AdminCrumb;
}

/**
 * Admin pages that aren't hub cards but still need a label when they show up
 * as a crumb. Anything missing here still gets a link back to its hub — the
 * trail just skips the intermediate step.
 */
const EXTRA_ADMIN_ROUTES: AdminRoute[] = [
  { href: "/admin/dli-groups", label: "DLI Groups", parent: "/admin/classrooms" },
  { href: "/admin/settings", label: "School Settings", root: SCHOOL_ADMIN_HUB },
  {
    href: "/admin/school-year",
    label: "School Year Management",
    root: SCHOOL_ADMIN_HUB,
  },
  {
    href: "/admin/integrations",
    label: "Manage Integrations",
    root: SCHOOL_ADMIN_HUB,
  },
  {
    href: "/admin/integrations/setup-guide",
    label: "Setup Guide",
    root: SCHOOL_ADMIN_HUB,
  },
];

const ADMIN_ROUTES: AdminRoute[] = [
  ...ADMIN_HUB_SECTIONS.flatMap((section) =>
    section.cards.map((card) => ({ href: card.href, label: card.label }))
  ),
  ...EXTRA_ADMIN_ROUTES,
];

/**
 * The route trees a hub owns, and so the ones that get a trail back to it.
 * Not every hub card lands in one: Meeting Agendas lives under `/minutes`,
 * which has its own home in the sidebar and its own breadcrumb, and sending
 * someone from there to the board hub would be a guess about where they came
 * from rather than a fact about where the page lives.
 */
const HUB_SCOPED_PREFIXES = ["/admin", "/onboarding", "/emails"];

const ROUTES_BY_HREF = new Map(ADMIN_ROUTES.map((route) => [route.href, route]));

/** The deepest registered route that contains `pathname`, if any. */
function nearestRoute(pathname: string): AdminRoute | undefined {
  let best: AdminRoute | undefined;
  for (const route of ADMIN_ROUTES) {
    const matches =
      pathname === route.href || pathname.startsWith(`${route.href}/`);
    if (matches && (!best || route.href.length > best.href.length)) {
      best = route;
    }
  }
  return best;
}

function parentPath(pathname: string): string {
  return pathname.slice(0, pathname.lastIndexOf("/"));
}

/**
 * The crumbs to show above a hub-owned page, hub first. Empty for the hubs
 * themselves and for pages that belong somewhere other than a hub.
 */
export function hubBreadcrumbs(pathname: string): AdminCrumb[] {
  const inScope = HUB_SCOPED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!inScope) return [];
  if (pathname === ADMIN_HUB.href || pathname === SCHOOL_ADMIN_HUB.href) {
    return [];
  }

  const trail: AdminCrumb[] = [];
  const seen = new Set<string>();
  let cursor = nearestRoute(pathname);
  const root = cursor?.root ?? ADMIN_HUB;

  while (cursor && !seen.has(cursor.href)) {
    seen.add(cursor.href);
    // The current page names itself in its own <h1>; it isn't a link.
    if (cursor.href !== pathname) {
      trail.unshift({ href: cursor.href, label: cursor.label });
    }
    cursor = cursor.parent
      ? ROUTES_BY_HREF.get(cursor.parent)
      : nearestRoute(parentPath(cursor.href));
  }

  trail.unshift(root);
  return trail;
}
