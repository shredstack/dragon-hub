"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { IconPicker } from "@/components/ui/icon-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";
import type {
  CapacityMode,
  CommitteeInput,
  CommitteeScope,
  CommitteeStatus,
} from "@/actions/committees";

/**
 * Create & edit dialog for a committee.
 *
 * Three configuration groups beyond the basics — Scope, Capacity, Recruiting —
 * each collapsed to its simplest form until the board opts into the complexity.
 * A school-wide, open-ended committee needs a name and nothing else.
 */

export interface CommitteeFormValue {
  name: string;
  description: string;
  responsibilities: string;
  typicalTiming: string;
  timeCommitment: string;
  iconEmoji: string;
  imageUrl: string;
  scope: CommitteeScope;
  classroomId: string;
  eventPlanId: string;
  grantsLinkedAccess: boolean;
  showOnRoomParentSignup: boolean;
  capacityMode: CapacityMode;
  minSize: string;
  maxSize: string;
  waitlistEnabled: boolean;
  opensAt: string;
  closesAt: string;
  ownerPosition: string;
  contactEmail: string;
  status: CommitteeStatus;
}

export const EMPTY_COMMITTEE: CommitteeFormValue = {
  name: "",
  description: "",
  responsibilities: "",
  typicalTiming: "",
  timeCommitment: "",
  iconEmoji: "",
  imageUrl: "",
  scope: "school",
  classroomId: "",
  eventPlanId: "",
  grantsLinkedAccess: false,
  showOnRoomParentSignup: false,
  capacityMode: "open",
  minSize: "",
  maxSize: "",
  waitlistEnabled: true,
  opensAt: "",
  closesAt: "",
  ownerPosition: "",
  contactEmail: "",
  status: "draft",
};

/** Form state → the action's input shape. Empty strings become nulls. */
export function toCommitteeInput(value: CommitteeFormValue): CommitteeInput {
  return {
    name: value.name,
    description: value.description || null,
    responsibilities: value.responsibilities || null,
    typicalTiming: value.typicalTiming || null,
    timeCommitment: value.timeCommitment || null,
    iconEmoji: value.iconEmoji || null,
    imageUrl: value.imageUrl || null,
    scope: value.scope,
    classroomId: value.scope === "classroom" ? value.classroomId || null : null,
    eventPlanId: value.scope === "event_plan" ? value.eventPlanId || null : null,
    grantsLinkedAccess: value.grantsLinkedAccess,
    showOnRoomParentSignup: value.showOnRoomParentSignup,
    capacityMode: value.capacityMode,
    minSize: value.minSize ? Number(value.minSize) : null,
    maxSize: value.maxSize ? Number(value.maxSize) : null,
    waitlistEnabled: value.waitlistEnabled,
    opensAt: value.opensAt || null,
    closesAt: value.closesAt || null,
    ownerPosition: value.ownerPosition || null,
    contactEmail: value.contactEmail || null,
    status: value.status,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: CommitteeFormValue;
  onChange: (next: Partial<CommitteeFormValue>) => void;
  onSubmit: () => Promise<void>;
  submitLabel: string;
  error?: string | null;
  /** Omitted on the create dialog, where scope pickers have nothing to point at. */
  classroomOptions?: Array<{ id: string; name: string; gradeLevel: string | null }>;
  eventPlanOptions?: Array<{ id: string; title: string; schoolYear: string }>;
}

export function CommitteeForm({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  onSubmit,
  submitLabel,
  error,
  classroomOptions = [],
  eventPlanOptions = [],
}: Props) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      await onSubmit();
    } finally {
      setIsSaving(false);
    }
  };

  const capped = value.capacityMode === "capped";
  const scoped = value.scope !== "school";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Basics ── */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="committee-name">Committee Name *</Label>
              <Input
                id="committee-name"
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="Yearbook Committee"
              />
            </div>

            <IconPicker
              iconEmoji={value.iconEmoji}
              imageUrl={value.imageUrl}
              onChange={(next) => onChange(next)}
            />

            <div>
              <Label htmlFor="committee-description">Description</Label>
              <Textarea
                id="committee-description"
                value={value.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="We put together the school yearbook — photos, layout, and getting it printed in time."
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="committee-responsibilities">
                What volunteers actually do
              </Label>
              <Textarea
                id="committee-responsibilities"
                value={value.responsibilities}
                onChange={(e) => onChange({ responsibilities: e.target.value })}
                placeholder="Take photos at school events, help sort and caption them, review proofs."
                rows={3}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The question every parent asks before signing up.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="committee-timing">When</Label>
                <Input
                  id="committee-timing"
                  value={value.typicalTiming}
                  onChange={(e) => onChange({ typicalTiming: e.target.value })}
                  placeholder="September through March"
                />
              </div>
              <div>
                <Label htmlFor="committee-commitment">Time commitment</Label>
                <Input
                  id="committee-commitment"
                  value={value.timeCommitment}
                  onChange={(e) => onChange({ timeCommitment: e.target.value })}
                  placeholder="About 2 hours a month"
                />
              </div>
            </div>
          </div>

          {/* ── Scope ── */}
          <fieldset className="space-y-3 border-t border-border pt-5">
            <legend className="sr-only">Scope</legend>
            <div>
              <Label className="text-base font-medium">What is this attached to?</Label>
              <p className="text-xs text-muted-foreground">
                Most committees are school-wide. You can change this later.
              </p>
            </div>

            <div className="space-y-2">
              <ScopeOption
                current={value.scope}
                option="school"
                label="School-wide"
                hint="Yearbook, Hospitality, Box Tops"
                onChange={(scope) => onChange({ scope })}
              />
              <ScopeOption
                current={value.scope}
                option="classroom"
                label="A classroom"
                hint="A grade-level or single-room committee"
                onChange={(scope) => onChange({ scope })}
                disabled={classroomOptions.length === 0}
              />
              <ScopeOption
                current={value.scope}
                option="event_plan"
                label="An event plan"
                hint="A crew running one event, e.g. Field Day logistics"
                onChange={(scope) => onChange({ scope })}
                disabled={eventPlanOptions.length === 0}
              />
            </div>

            {value.scope === "classroom" && (
              <div>
                <Label htmlFor="committee-classroom">Classroom *</Label>
                <select
                  id="committee-classroom"
                  value={value.classroomId}
                  onChange={(e) => onChange({ classroomId: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a classroom…</option>
                  {classroomOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.gradeLevel ? `${c.gradeLevel} · ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {value.scope === "event_plan" && (
              <div>
                <Label htmlFor="committee-event-plan">Event plan *</Label>
                <select
                  id="committee-event-plan"
                  value={value.eventPlanId}
                  onChange={(e) => onChange({ eventPlanId: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select an event plan…</option>
                  {eventPlanOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.schoolYear})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scoped && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <ToggleRow
                  id="committee-grants-access"
                  checked={value.grantsLinkedAccess}
                  onChange={(grantsLinkedAccess) => onChange({ grantsLinkedAccess })}
                  label="Joining also grants access to it"
                  hint={
                    value.scope === "event_plan"
                      ? "Event plans hold budgets and vendor contacts. Anyone who scans the public join link would see them."
                      : "Grants classroom volunteer access — never room parent."
                  }
                />
                {value.grantsLinkedAccess && (
                  <p className="mt-2 text-xs text-amber-800">
                    Access granted this way is <strong>not</strong> automatically
                    revoked when someone is removed from the committee.
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {/* ── Capacity ── */}
          <fieldset className="space-y-3 border-t border-border pt-5">
            <legend className="sr-only">Capacity</legend>
            <Label className="text-base font-medium">How many volunteers?</Label>

            <div className="space-y-2">
              <ScopeOption
                current={value.capacityMode}
                option="open"
                label="Open to anyone"
                hint="The more the merrier — everyone who signs up joins"
                onChange={(capacityMode) =>
                  onChange({ capacityMode: capacityMode as CapacityMode })
                }
              />
              <ScopeOption
                current={value.capacityMode}
                option="capped"
                label="Limit the size"
                hint="Once full, further sign-ups go to a waitlist"
                onChange={(capacityMode) =>
                  onChange({ capacityMode: capacityMode as CapacityMode })
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="committee-min">How many do you need?</Label>
                <Input
                  id="committee-min"
                  type="number"
                  min={1}
                  value={value.minSize}
                  onChange={(e) => onChange({ minSize: e.target.value })}
                  placeholder="Optional"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Drives the &ldquo;we still need 3 more&rdquo; nudge. Never turns
                  anyone away.
                </p>
              </div>
              {capped && (
                <div>
                  <Label htmlFor="committee-max">Maximum size *</Label>
                  <Input
                    id="committee-max"
                    type="number"
                    min={1}
                    value={value.maxSize}
                    onChange={(e) => onChange({ maxSize: e.target.value })}
                    placeholder="10"
                  />
                </div>
              )}
            </div>

            {capped && (
              <ToggleRow
                id="committee-waitlist"
                checked={value.waitlistEnabled}
                onChange={(waitlistEnabled) => onChange({ waitlistEnabled })}
                label="Keep a waitlist when it's full"
                hint="A spot opening promotes the person at the front of the line automatically. Off means the form simply closes."
              />
            )}
          </fieldset>

          {/* ── Recruiting ── */}
          <fieldset className="space-y-3 border-t border-border pt-5">
            <legend className="sr-only">Recruiting</legend>
            <Label className="text-base font-medium">Recruiting</Label>

            <ToggleRow
              id="committee-addon"
              checked={value.showOnRoomParentSignup}
              onChange={(showOnRoomParentSignup) =>
                onChange({ showOnRoomParentSignup })
              }
              label="Show on the room parent sign-up page"
              hint="One QR code at Back to School Night captures classroom roles, event interest, and this committee in a single pass."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="committee-opens">Opens</Label>
                <Input
                  id="committee-opens"
                  type="datetime-local"
                  value={value.opensAt}
                  onChange={(e) => onChange({ opensAt: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="committee-closes">Closes</Label>
                <Input
                  id="committee-closes"
                  type="datetime-local"
                  value={value.closesAt}
                  onChange={(e) => onChange({ closesAt: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="committee-owner">Who do I ask?</Label>
                <select
                  id="committee-owner"
                  value={value.ownerPosition}
                  onChange={(e) => onChange({ ownerPosition: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No board position</option>
                  {Object.entries(PTA_BOARD_POSITIONS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="committee-contact">Contact email</Label>
                <Input
                  id="committee-contact"
                  type="email"
                  value={value.contactEmail}
                  onChange={(e) => onChange({ contactEmail: e.target.value })}
                  placeholder="yearbook@ourpta.org"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="committee-status">Status</Label>
              <select
                id="committee-status"
                value={value.status}
                onChange={(e) =>
                  onChange({ status: e.target.value as CommitteeStatus })
                }
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="draft">Draft — join link is off</option>
                <option value="active">Active — accepting sign-ups</option>
                <option value="closed">Closed — visible to members only</option>
              </select>
            </div>
          </fieldset>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !value.name.trim()}>
            {isSaving ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A radio row with a hint, used by both the scope and capacity choosers. */
function ScopeOption<T extends string>({
  current,
  option,
  label,
  hint,
  onChange,
  disabled = false,
}: {
  current: T;
  option: T;
  label: string;
  hint: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
        current === option
          ? "border-dragon-blue-500 bg-dragon-blue-50"
          : "border-border hover:border-dragon-blue-300"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        checked={current === option}
        onChange={() => onChange(option)}
        disabled={disabled}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function ToggleRow({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
