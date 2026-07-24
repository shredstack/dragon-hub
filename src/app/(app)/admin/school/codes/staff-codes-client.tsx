"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStaffJoinCode,
  setStaffJoinCodeActive,
  deleteStaffJoinCode,
  approvePendingStaff,
  denyPendingStaff,
} from "@/actions/school-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Plus, Trash2, Copy, Check, X } from "lucide-react";

interface CodeRow {
  id: string;
  code: string;
  label: string;
  active: boolean;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
}

interface PendingRow {
  membershipId: string;
  name: string | null;
  email: string;
  codeLabel: string | null;
  requestedAt: string | null;
}

interface Props {
  codes: CodeRow[];
  pending: PendingRow[];
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function StaffCodesClient({ codes, pending }: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function run(fn: () => Promise<unknown>, successMessage: string) {
    try {
      await fn();
      addToast(successMessage, "success");
      refresh();
      return true;
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Something went wrong",
        "destructive"
      );
      return false;
    }
  }

  async function handleCreate() {
    setBusyId("new");
    const ok = await run(
      () =>
        createStaffJoinCode({
          label: newLabel || "Staff access code",
          code: newCode || undefined,
          maxUses: newMaxUses ? Number(newMaxUses) : null,
          expiresAt: newExpiresAt || null,
        }),
      "Code created"
    );
    setBusyId(null);
    if (ok) {
      setNewLabel("");
      setNewCode("");
      setNewMaxUses("");
      setNewExpiresAt("");
      setAdding(false);
    }
  }

  async function handleCopy(row: CodeRow) {
    try {
      await navigator.clipboard.writeText(row.code);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      addToast("Couldn't copy — select the code and copy it by hand", "destructive");
    }
  }

  async function handleDelete(row: CodeRow) {
    const confirmed = await confirm({
      title: `Delete ${row.label}?`,
      description:
        "Anyone holding this code won't be able to use it. People already approved keep their access.",
      alternative: "Turning it off instead lets you switch it back on later.",
      confirmLabel: "Delete code",
      tone: "destructive",
    });
    if (!confirmed) return;

    setBusyId(row.id);
    await run(() => deleteStaffJoinCode(row.id), `Deleted ${row.label}`);
    closeConfirm();
    setBusyId(null);
  }

  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">
            Waiting for approval ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((p) => {
              const isBusy = busyId === p.membershipId || isPending;
              return (
                <div
                  key={p.membershipId}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{p.name ?? p.email}</p>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used {p.codeLabel ?? "a staff code"}
                        {formatDate(p.requestedAt)
                          ? ` · ${formatDate(p.requestedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusyId(p.membershipId);
                          await run(
                            () => approvePendingStaff(p.membershipId),
                            `${p.name ?? p.email} approved`
                          );
                          setBusyId(null);
                        }}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusyId(p.membershipId);
                          await run(
                            () => denyPendingStaff(p.membershipId),
                            "Request denied"
                          );
                          setBusyId(null);
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Deny
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Codes</h2>
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New code
            </Button>
          )}
        </div>

        {adding && (
          <div className="mb-4 rounded-lg border border-border bg-card p-4">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  What this code is for
                </label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Front office staff"
                  autoFocus
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Code <span className="font-normal">(optional)</span>
                  </label>
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="Auto"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Max uses <span className="font-normal">(optional)</span>
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={newMaxUses}
                    onChange={(e) => setNewMaxUses(e.target.value)}
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Expires <span className="font-normal">(optional)</span>
                  </label>
                  <Input
                    type="date"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={busyId === "new"}
                >
                  {busyId === "new" ? "Creating..." : "Create code"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {codes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No staff codes yet. Create one to invite another administrator.
          </p>
        ) : (
          <div className="space-y-2">
            {codes.map((row) => {
              const isBusy = busyId === row.id || isPending;
              const expires = formatDate(row.expiresAt);
              return (
                <div
                  key={row.id}
                  className={`rounded-lg border border-border bg-card p-4 ${
                    row.active ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                          {row.code}
                        </code>
                        <button
                          onClick={() => handleCopy(row)}
                          aria-label={`Copy ${row.code}`}
                          className="rounded p-1 text-muted-foreground hover:bg-accent"
                        >
                          {copiedId === row.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        {!row.active && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Off
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm">{row.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used {row.uses}
                        {row.maxUses ? ` of ${row.maxUses}` : ""} time
                        {row.uses === 1 ? "" : "s"}
                        {expires ? ` · expires ${expires}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={row.active}
                        disabled={isBusy}
                        onCheckedChange={async () => {
                          setBusyId(row.id);
                          await run(
                            () => setStaffJoinCodeActive(row.id, !row.active),
                            row.active ? "Code turned off" : "Code turned on"
                          );
                          setBusyId(null);
                        }}
                      />
                      <button
                        onClick={() => handleDelete(row)}
                        disabled={isBusy}
                        aria-label={`Delete ${row.label}`}
                        className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {confirmDialog}
    </div>
  );
}
