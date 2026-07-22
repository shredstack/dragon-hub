"use client";

import { UserMenu } from "./user-menu";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { MobileNav } from "./mobile-nav";
import type { NavVisibility } from "@/lib/nav-config";

interface HeaderProps {
  userName: string | null;
  userEmail: string;
  userImage?: string | null;
  isPtaBoard: boolean;
  isSchoolAdmin?: boolean;
  isSuperAdmin?: boolean;
  navVisibility: NavVisibility;
}

export function Header({ userName, userEmail, userImage, isPtaBoard, isSchoolAdmin, isSuperAdmin, navVisibility }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-md p-2 hover:bg-muted lg:hidden"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>

        <div className="flex items-center gap-2 lg:hidden">
          <Image
            src="/dragon-hub-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
          />
          <span className="text-lg font-bold text-dragon-blue-500">
            Dragon Hub
          </span>
        </div>

        <div className="hidden lg:block" />

        <UserMenu name={userName} email={userEmail} image={userImage} />
      </header>

      {mobileMenuOpen && (
        <MobileNav
          isPtaBoard={isPtaBoard}
          isSchoolAdmin={isSchoolAdmin}
          isSuperAdmin={isSuperAdmin}
          navVisibility={navVisibility}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
