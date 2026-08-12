"use client";

/**
 * Defining a committee's material bands — "we own one junior kit for K–2 and
 * one senior kit for 3–5".
 *
 * Optional and empty by default: with no bands the schedule warns on any
 * overlap at all, which is the right behaviour for a committee that has no
 * shared kit to run out of. A school only fills this in when overlap means
 * something more specific than "two things at once".
 *
 * See `schedule-bands.ts` for the rules; this form applies exactly the same
 * validation the server does, so nothing gets past here that the action would
 * then reject.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  BAND_GRADE_CHOICES,
  validateScheduleBands,
  type ScheduleBand,
} from "@/lib/schedule-bands";

const SELECT_CLASS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

interface ScheduleBandsFieldProps {
  value: ScheduleBand[];
  onChange: (bands: ScheduleBand[]) => void;
}

export function ScheduleBandsField({
  value,
  onChange,
}: ScheduleBandsFieldProps) {
  const error = value.length > 0 ? validateScheduleBands(value) : null;

  const update = (id: string, patch: Partial<ScheduleBand>) =>
    onChange(value.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const add = () =>
    onChange([
      ...value,
      {
        // Ids only need to be unique within one committee's list, and they
        // never leave it — `crypto.randomUUID` would work too but this stays
        // readable in the JSON column.
        id: `band-${value.length + 1}-${value.length ? value[value.length - 1].maxGrade + 1 : 0}`,
        label: "",
        minGrade: 0,
        maxGrade: 2,
        concurrentLimit: 1,
      },
    ]);

  return (
    <div className="space-y-3">
      <div>
        <Label>Shared materials</Label>
        <p className="text-muted-foreground mt-1 text-xs">
          Optional. If the committee shares a limited kit — one junior set, one
          senior set — say so here and the schedule will only flag a clash
          between classrooms that actually compete for it. Leave empty to warn
          on any overlapping time.
        </p>
      </div>

      {value.map((band) => (
        <div
          key={band.id}
          className="border-border bg-card space-y-3 rounded-md border p-3"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`${band.id}-label`}>Name</Label>
              <Input
                id={`${band.id}-label`}
                className="mt-1"
                value={band.label}
                placeholder="Junior kit"
                onChange={(e) => update(band.id, { label: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-6"
              aria-label={`Remove ${band.label || "band"}`}
              onClick={() => onChange(value.filter((b) => b.id !== band.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`${band.id}-min`}>From</Label>
              <select
                id={`${band.id}-min`}
                className={SELECT_CLASS}
                value={band.minGrade}
                onChange={(e) =>
                  update(band.id, { minGrade: Number(e.target.value) })
                }
              >
                {BAND_GRADE_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`${band.id}-max`}>To</Label>
              <select
                id={`${band.id}-max`}
                className={SELECT_CLASS}
                value={band.maxGrade}
                onChange={(e) =>
                  update(band.id, { maxGrade: Number(e.target.value) })
                }
              >
                {BAND_GRADE_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`${band.id}-limit`}>At a time</Label>
              <Input
                id={`${band.id}-limit`}
                className="mt-1"
                type="number"
                min={1}
                value={band.concurrentLimit}
                onChange={(e) =>
                  update(band.id, {
                    concurrentLimit: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            How many of these classrooms can be scheduled at once — i.e. how
            many kits the school owns.
          </p>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Add a set of materials
        </Button>
        {value.length === 0 && (
          <Badge variant="secondary">Warns on any overlap</Badge>
        )}
      </div>
    </div>
  );
}
