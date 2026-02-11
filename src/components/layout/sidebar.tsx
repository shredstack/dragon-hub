"use client";

import { NavItem } from "./nav-item";
import Link from "next/link";
import Image from "next/image";
import {
  mainNavItems,
  adminNavItems,
  schoolAdminNavItems,
  superAdminNavItem,
} from "@/lib/nav-config";

interface SidebarProps {
  isPtaBoard: boolean;
  isSchoolAdmin?: boolean;
  isSuperAdmin?: boolean;
  schoolName?: string;
}

export function Sidebar({ isPtaBoard, isSchoolAdmin, isSuperAdmin, schoolName }: SidebarProps) {
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
              {isSchoolAdmin && schoolAdminNavItems.map((item) => (
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
                href={superAdminNavItem.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <superAdminNavItem.icon className="h-4 w-4" />
                {superAdminNavItem.label}
              </Link>
            </>
          )}
        </nav>
      </div>
    </aside>
  );
}
