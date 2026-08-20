import {
  LayoutDashboard,
  School,
  Clock,
  Calendar,
  ClipboardList,
  DollarSign,
  Heart,
  BookOpen,
  ShieldCheck,
  Settings,
  Users,
  Shield,
  CalendarClock,
  Plug,
  FileText,
  ListChecks,
  Tags,
  Mail,
  GraduationCap,
  Image,
  UserPlus,
  Receipt,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Nav entries that aren't open to every school member. */
export interface NavVisibility {
  /** PTA board, school admin, or a member of at least one event plan. */
  canViewEventPlans?: boolean;
  /** Open to members unless the school hides Budget; leadership always sees it. */
  canViewBudget?: boolean;
  /** Same, for Fundraisers. */
  canViewFundraisers?: boolean;
  /** PTA board, school admin, or a member of at least one committee. */
  canViewCommittees?: boolean;
}

/**
 * Which flag, if any, gates each restricted nav entry.
 *
 * `/events` is deliberately absent. It used to be Event Plans, gated on
 * `canViewEventPlans`, and it 404'd for most of the school. Our Events took
 * that URL and is open to every approved member; the plan list moved to
 * `/events/plans` and left the sidebar entirely, because two event tabs — one
 * of which most people can't open — is worse than one front door with a way in.
 * `canViewEventPlans` still decides whether that way in is rendered, on the
 * Our Events page itself.
 */
const GATED_NAV_ITEMS: Record<string, keyof NavVisibility> = {
  "/events/plans": "canViewEventPlans",
  "/budget": "canViewBudget",
  "/fundraisers": "canViewFundraisers",
  "/committees": "canViewCommittees",
};

/**
 * The main nav, minus anything this user has no access to. Filtering here
 * rather than in each nav component keeps the sidebar and the mobile menu from
 * drifting apart — a link visible in one and hidden in the other is the whole
 * point of the restriction leaking.
 */
export function visibleMainNavItems(visibility: NavVisibility): NavItem[] {
  return mainNavItems.filter((item) => {
    const gate = GATED_NAV_ITEMS[item.href];
    return !gate || visibility[gate];
  });
}

export const mainNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/classrooms", label: "Classrooms", icon: School },
  // Committees are the general sibling of classroom groups, so they sit next
  // to them rather than down with the board's tools.
  { href: "/committees", label: "Committees", icon: Users },
  { href: "/volunteer-hours", label: "Volunteer Hours", icon: Clock },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  // The school's front window: what the PTA runs, what each one is, and how to
  // raise a hand. Open to everyone — it sits after Calendar because "when is
  // it?" and "what is it?" are the same question asked two ways.
  { href: "/events", label: "Events", icon: PartyPopper },
  { href: "/budget", label: "Budget", icon: DollarSign },
  // Sits with Budget rather than with the board's tools: anyone on an event
  // plan can file a request, and everyone can see their own.
  { href: "/reimbursements", label: "Reimbursements", icon: Receipt },
  { href: "/fundraisers", label: "Fundraisers", icon: Heart },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/minutes", label: "PTA Minutes", icon: FileText },
];

// Admin nav for PTA Board members - single hub entry point
// All admin pages should be linked from within the PTA Board Hub, not added here
export const adminNavItems: NavItem[] = [
  { href: "/admin/board", label: "PTA Board Hub", icon: LayoutDashboard },
];

// School admin nav - only for users with admin school role
export const schoolAdminNavItems: NavItem[] = [
  { href: "/admin/school", label: "School Admin", icon: Settings },
];

// Super admin nav
export const superAdminNavItem: NavItem = {
  href: "/super-admin",
  label: "Super Admin",
  icon: Shield,
};

// Re-export icons that components might need directly
export {
  LayoutDashboard,
  School,
  Clock,
  Calendar,
  ClipboardList,
  DollarSign,
  Heart,
  BookOpen,
  ShieldCheck,
  Settings,
  Users,
  Shield,
  CalendarClock,
  Plug,
  FileText,
  ListChecks,
  Tags,
  Mail,
  GraduationCap,
  Image,
  UserPlus,
  Receipt,
  PartyPopper,
};
