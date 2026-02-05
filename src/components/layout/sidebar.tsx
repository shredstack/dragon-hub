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
} from "lucide-react";
import { NavItem } from "./nav-item";

interface SidebarProps {
  isPtaBoard: boolean;
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
];

const adminNavItems = [
  { href: "/admin/overview", label: "Admin Dashboard", icon: Settings },
  { href: "/admin/classrooms", label: "Manage Classrooms", icon: School },
  { href: "/admin/members", label: "Manage Members", icon: Users },
  { href: "/admin/budget", label: "Manage Budget", icon: DollarSign },
  { href: "/admin/fundraisers", label: "Manage Fundraisers", icon: Heart },
  { href: "/admin/volunteer-hours", label: "Approve Hours", icon: ShieldCheck },
];

export function Sidebar({ isPtaBoard }: SidebarProps) {
  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-border bg-card lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-6 py-5">
          <h1 className="text-xl font-bold text-dragon-blue-500">
            Dragon Hub
          </h1>
          <p className="text-xs text-muted-foreground">Draper Dragons PTA</p>
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
        </nav>
      </div>
    </aside>
  );
}
