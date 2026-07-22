"use client";

import { useState, useTransition } from "react";
import { DollarSign, Heart, Loader2, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateModuleVisibility } from "@/actions/school-membership";
import type {
  HideableModule,
  ModuleVisibility,
} from "@/lib/module-visibility";

interface ModuleVisibilityEditorProps {
  schoolId: string;
  initialVisibility: ModuleVisibility;
}

const MODULES: {
  key: HideableModule;
  label: string;
  icon: LucideIcon;
  description: string;
}[] = [
  {
    key: "budget",
    label: "Budget",
    icon: DollarSign,
    description: "Budget dashboard and its nav link.",
  },
  {
    key: "fundraisers",
    label: "Fundraisers",
    icon: Heart,
    description:
      "Fundraiser pages, the nav link, and the dashboard tile.",
  },
];

export function ModuleVisibilityEditor({
  schoolId,
  initialVisibility,
}: ModuleVisibilityEditorProps) {
  const [visibility, setVisibility] =
    useState<ModuleVisibility>(initialVisibility);
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<HideableModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (key: HideableModule, visible: boolean) => {
    const previous = visibility;
    const next = { ...visibility, [key]: visible };

    setVisibility(next);
    setError(null);
    setPendingKey(key);

    startTransition(async () => {
      try {
        await updateModuleVisibility(schoolId, next);
      } catch (err) {
        setVisibility(previous);
        setError(
          err instanceof Error ? err.message : "Failed to update visibility"
        );
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Feature Visibility</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Turn off any area your school doesn&apos;t track in DragonHub. PTA board
        members and school admins keep access either way.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {MODULES.map((mod) => {
          const isVisible = visibility[mod.key] !== false;
          return (
            <div
              key={mod.key}
              className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-dragon-blue-500/10 p-2 text-dragon-blue-500">
                  <mod.icon className="h-5 w-5" />
                </div>
                <div>
                  <label
                    htmlFor={`module-${mod.key}`}
                    className="font-medium"
                  >
                    {mod.label}
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {mod.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isVisible
                      ? "Visible to all members"
                      : "Hidden — board and admins only"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isPending && pendingKey === mod.key && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  id={`module-${mod.key}`}
                  checked={isVisible}
                  disabled={isPending}
                  onCheckedChange={(checked) => handleToggle(mod.key, checked)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
