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
}

/**
 * The main nav, minus anything this user has no access to. Filtering here
 * rather than in each nav component keeps the sidebar and the mobile menu from
 * drifting apart — a link visible in one and hidden in the other is the whole
 * point of the restriction leaking.
 */
export function visibleMainNavItems(visibility: NavVisibility): NavItem[] {
  return mainNavItems.filter(
    (item) => item.href !== "/events" || visibility.canViewEventPlans
  );
}

export const mainNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/classrooms", label: "Classrooms", icon: School },
  { href: "/volunteer-hours", label: "Volunteer Hours", icon: Clock },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/events", label: "Event Plans", icon: ClipboardList },
  { href: "/budget", label: "Budget", icon: DollarSign },
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
};
