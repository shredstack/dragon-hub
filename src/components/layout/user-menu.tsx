"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut, User, Settings } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface UserMenuProps {
  name: string | null;
  email: string;
  image?: string | null;
}

/**
 * Best-effort: a failure here must not be able to trap someone in a session
 * they are trying to leave, so every step swallows its own error.
 */
async function unregisterThisDevice(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { getStoredPushToken, clearPushToken } = await import(
      "@/lib/native-preferences"
    );
    const token = await getStoredPushToken();
    if (!token) return;

    await fetch(`/api/push-tokens?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
      credentials: "include",
    });
    await clearPushToken();
  } catch {
    // Offline, or not native. Sign-out proceeds regardless.
  }
}

export function UserMenu({ name, email, image }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleSignOut = async () => {
    // Unregister this device's push token FIRST, while the session cookie is
    // still valid — `DELETE /api/push-tokens` is session-scoped, so doing it
    // after `signOut` is a 401 and a silent no-op.
    //
    // Without this, a shared family tablet keeps receiving the previous
    // person's notifications indefinitely: the token row still points at their
    // user id, and nothing else ever removes it.
    await unregisterThisDevice();
    await signOut({ redirect: false });
    router.push("/sign-in");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
      >
        {image ? (
          <Image
            src={image}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dragon-blue-500 text-xs font-medium text-white">
            {name ? getInitials(name) : <User className="h-4 w-4" />}
          </div>
        )}
        <span className="hidden text-sm font-medium md:block">
          {name || email}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-card py-1 shadow-lg">
          <div className="border-b border-border px-4 py-2">
            <p className="text-sm font-medium">{name || "User"}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Profile
          </Link>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
