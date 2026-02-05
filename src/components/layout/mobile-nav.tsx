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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  isPtaBoard: boolean;
  onClose: () => void;
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

export function MobileNav({ isPtaBoard, onClose }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <div className="fixed inset-0 top-14 z-50 bg-card lg:hidden">
      <nav className="space-y-1 px-3 py-4">
        {mainNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-dragon-blue-500 text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {isPtaBoard && (
          <>
            <div className="my-3 border-t border-border" />
            <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
              Admin
            </p>
            {adminNavItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-dragon-blue-500 text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
    </div>
  );
}
