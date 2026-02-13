"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import {
  Users,
  Mail,
  Image as ImageIcon,
  ListChecks,
  CalendarDays,
  Tags,
  DollarSign,
  Heart,
  School,
  UserPlus,
  ShieldCheck,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Users,
  Mail,
  Image: ImageIcon,
  ListChecks,
  CalendarDays,
  Tags,
  DollarSign,
  Heart,
  School,
  UserPlus,
  ShieldCheck,
  GraduationCap,
};

interface SerializedHubCard {
  label: string;
  description: string;
  href: string;
  iconName: string;
}

interface SerializedHubSection {
  title: string;
  cards: SerializedHubCard[];
}

interface HubSectionsFilterProps {
  sections: SerializedHubSection[];
}

export function HubSectionsFilter({ sections }: HubSectionsFilterProps) {
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const term = search.toLowerCase();
    return sections
      .map((section) => ({
        ...section,
        cards: section.cards.filter(
          (card) =>
            card.label.toLowerCase().includes(term) ||
            card.description.toLowerCase().includes(term)
        ),
      }))
      .filter((section) => section.cards.length > 0);
  }, [sections, search]);

  return (
    <div className="mt-8 space-y-8">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search admin tools... (e.g. budget, volunteers, email)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search admin tools"
          className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-10 text-sm placeholder:text-muted-foreground focus:border-dragon-blue-500 focus:outline-none focus:ring-1 focus:ring-dragon-blue-500"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filtered Sections */}
      {filteredSections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-4 text-lg font-semibold">{section.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.cards.map((card) => {
              const Icon = ICON_MAP[card.iconName] ?? GraduationCap;
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-dragon-blue-500 hover:bg-dragon-blue-500/5"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-dragon-blue-500/10 p-2 text-dragon-blue-500">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium group-hover:text-dragon-blue-500">
                        {card.label}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* No Results */}
      {filteredSections.length === 0 && search && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">
            No tools matching &ldquo;{search}&rdquo;
          </p>
          <button
            onClick={() => setSearch("")}
            className="mt-2 text-sm text-dragon-blue-500 hover:underline"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
