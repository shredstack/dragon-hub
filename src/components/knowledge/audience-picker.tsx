"use client";

import { useEffect, useState } from "react";
import { Users, Lock } from "lucide-react";
import { getAudienceOptions } from "@/actions/knowledge";
import type {
  AudienceGrant,
  VolunteerRole,
} from "@/lib/knowledge-audience-shared";
import { VOLUNTEER_ROLE_LABELS } from "@/lib/knowledge-audience-shared";

interface Props {
  value: AudienceGrant[];
  onChange: (grants: AudienceGrant[]) => void;
}

const VOLUNTEER_ROLES: VolunteerRole[] = ["room_parent", "party_volunteer"];

/**
 * Checklist of who an article is shared with.
 *
 * Nothing checked is a real, meaningful state — board and school admins only —
 * so the empty case gets its own explanatory row rather than reading as an
 * unfinished form.
 *
 * Checking "Everyone at the school" disables the narrower options instead of
 * hiding them: it makes the widening obvious, and unchecking restores whatever
 * the board had picked before.
 */
export function AudiencePicker({ value, onChange }: Props) {
  const [committees, setCommittees] = useState<
    Array<{ id: string; name: string; iconEmoji: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAudienceOptions()
      .then((o) => setCommittees(o.committees))
      .catch(() => setCommittees([]))
      .finally(() => setLoading(false));
  }, []);

  const hasEveryone = value.some((g) => g.type === "everyone");

  function toggle(grant: AudienceGrant, checked: boolean) {
    if (checked) {
      onChange([...value, grant]);
      return;
    }
    onChange(value.filter((g) => !sameGrant(g, grant)));
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Shared with</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Leave everything unchecked to keep this article visible to the PTA Board
        and school admins only.
      </p>

      {value.length === 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Right now only the PTA Board and school admins can see this article.
          </span>
        </div>
      )}

      <div className="space-y-2">
        <AudienceCheckbox
          label="Everyone at the school"
          description="Any signed-in parent or staff member"
          checked={hasEveryone}
          onChange={(c) => toggle({ type: "everyone" }, c)}
        />

        <div className="pt-1">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Volunteer roles
          </p>
          <div className="space-y-2">
            {VOLUNTEER_ROLES.map((role) => (
              <AudienceCheckbox
                key={role}
                label={VOLUNTEER_ROLE_LABELS[role]}
                checked={value.some(
                  (g) => g.type === "volunteer_role" && g.volunteerRole === role
                )}
                disabled={hasEveryone}
                onChange={(c) =>
                  toggle({ type: "volunteer_role", volunteerRole: role }, c)
                }
              />
            ))}
          </div>
        </div>

        <div className="pt-1">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Committees
          </p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : committees.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active committees this year.
            </p>
          ) : (
            <div className="space-y-2">
              {committees.map((c) => (
                <AudienceCheckbox
                  key={c.id}
                  label={`${c.iconEmoji ? `${c.iconEmoji} ` : ""}${c.name}`}
                  checked={value.some(
                    (g) => g.type === "committee" && g.committeeId === c.id
                  )}
                  disabled={hasEveryone}
                  onChange={(ch) =>
                    toggle({ type: "committee", committeeId: c.id }, ch)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AudienceCheckbox({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 text-sm ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
      />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function sameGrant(a: AudienceGrant, b: AudienceGrant): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "committee" && b.type === "committee") {
    return a.committeeId === b.committeeId;
  }
  if (a.type === "volunteer_role" && b.type === "volunteer_role") {
    return a.volunteerRole === b.volunteerRole;
  }
  return true;
}
