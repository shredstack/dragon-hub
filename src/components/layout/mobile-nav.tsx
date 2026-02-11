"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  mainNavItems,
  adminNavItems,
  schoolAdminNavItems,
  superAdminNavItem,
} from "@/lib/nav-config";

interface MobileNavProps {
  isPtaBoard: boolean;
  isSchoolAdmin?: boolean;
  isSuperAdmin?: boolean;
  onClose: () => void;
}

export function MobileNav({ isPtaBoard, isSchoolAdmin, isSuperAdmin, onClose }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <div className="fixed inset-0 top-14 z-50 overflow-y-auto bg-card pb-6 lg:hidden">
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
            {isSchoolAdmin && schoolAdminNavItems.map((item) => {
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

        {isSuperAdmin && (
          <>
            <div className="my-3 border-t border-border" />
            <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
              Super Admin
            </p>
            <Link
              href={superAdminNavItem.href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <superAdminNavItem.icon className="h-4 w-4 shrink-0" />
              <span>{superAdminNavItem.label}</span>
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}
