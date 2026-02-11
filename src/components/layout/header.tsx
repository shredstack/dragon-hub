"use client";

import { UserMenu } from "./user-menu";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { MobileNav } from "./mobile-nav";

interface HeaderProps {
  userName: string | null;
  userEmail: string;
  isPtaBoard: boolean;
  isSchoolAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export function Header({ userName, userEmail, isPtaBoard, isSchoolAdmin, isSuperAdmin }: HeaderProps) {
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

        <div className="lg:hidden">
          <span className="text-lg font-bold text-dragon-blue-500">
            Dragon Hub
          </span>
        </div>

        <div className="hidden lg:block" />

        <UserMenu name={userName} email={userEmail} />
      </header>

      {mobileMenuOpen && (
        <MobileNav
          isPtaBoard={isPtaBoard}
          isSchoolAdmin={isSchoolAdmin}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
