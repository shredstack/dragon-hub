"use client";

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
} from "lucide-react";
import { NavItem } from "./nav-item";
import Link from "next/link";
import Image from "next/image";

interface SidebarProps {
  isPtaBoard: boolean;
  isSuperAdmin?: boolean;
  schoolName?: string;
}

const mainNavItems = [
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

const adminNavItems = [
  { href: "/admin/overview", label: "Admin Dashboard", icon: LayoutDashboard },
  { href: "/admin/classrooms", label: "Manage Classrooms", icon: School },
  { href: "/admin/members", label: "Manage Members", icon: Users },
  { href: "/admin/budget", label: "Manage Budget", icon: DollarSign },
  { href: "/admin/fundraisers", label: "Manage Fundraisers", icon: Heart },
  { href: "/admin/volunteer-hours", label: "Approve Hours", icon: ShieldCheck },
  { href: "/minutes/agenda", label: "Meeting Agendas", icon: ListChecks },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/school-year", label: "School Year", icon: CalendarClock },
  { href: "/admin/settings", label: "School Settings", icon: Settings },
];

export function Sidebar({ isPtaBoard, isSuperAdmin, schoolName }: SidebarProps) {
  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-border bg-card lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <Image
              src="/dragon-hub-logo.png"
              alt="Dragon Hub"
              width={64}
              height={64}
              className="shrink-0"
            />
            <div>
              <h1 className="text-xl font-bold text-dragon-blue-500">
                Dragon Hub
              </h1>
              <p className="text-xs text-muted-foreground">
                {schoolName || "No school selected"}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {mainNavItems.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}

          {isPtaBoard && (
            <>
              <div className="my-3 border-t border-border" />
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
                Admin
              </p>
              {adminNavItems.map((item) => (
                <NavItem key={item.href} {...item} />
              ))}
            </>
          )}

          {isSuperAdmin && (
            <>
              <div className="my-3 border-t border-border" />
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
                Super Admin
              </p>
              <Link
                href="/super-admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Shield className="h-4 w-4" />
                Manage Schools
              </Link>
            </>
          )}
        </nav>
      </div>
    </aside>
  );
}
