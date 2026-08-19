"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DistrictSelect } from "@/components/ui/district-select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  AlertTriangle,
  Building2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createReimbursementPolicy,
  deleteReimbursementPolicy,
  getAllReimbursementPolicies,
  updateReimbursementPolicy,
  type ReimbursementPolicyRow,
} from "@/actions/reimbursement-policies";
import { STANDARD_BOARD_POSITIONS } from "@/lib/board-positions-shared";
import { US_STATES } from "@/lib/constants";
import { actionErrorMessage } from "@/lib/action-error";

const STATE_NAMES = Object.values(US_STATES);

interface FormState {
  state: string;
  district: string;
  approverRoles: string[];
  requiresMinutesApproval: boolean;
  salesTaxRefundTracking: boolean;
  taxGuidanceNote: string;
  submissionWindowDays: string;
  spendingCardsEnabled: boolean;
}

const EMPTY_FORM: FormState = {
  state: "",
  district: "",
  approverRoles: ["treasurer", "president"],
  requiresMinutesApproval: false,
  salesTaxRefundTracking: false,
  taxGuidanceNote: "",
  submissionWindowDays: "60",
  spendingCardsEnabled: false,
};

/**
 * State and district reimbursement rules, in the shape of the regional
 * onboarding resources manager next door: one list, one inline form, and a
 * delete that is safe because everything below it falls back a level.
 *
 * Approver roles are picked from the *standard* board slate, never typed. They
 * are stored as slugs on every request, and a school that renamed "Treasurer"
 * still resolves the slug to its own label — but a slug nobody's slate contains
 * would name a position no one can hold, and freeze every request under it.
 */
export function ReimbursementPoliciesManager() {
  const [policies, setPolicies] = useState<ReimbursementPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReimbursementPolicyRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setPolicies(await getAllReimbursementPolicies());
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function startEdit(policy: ReimbursementPolicyRow) {
    setEditing(policy);
    setForm({
      state: policy.state ?? policy.districtState ?? "",
      district: policy.districtName ?? "",
      approverRoles: policy.approverRoles,
      requiresMinutesApproval: policy.requiresMinutesApproval,
      salesTaxRefundTracking: policy.salesTaxRefundTracking,
      taxGuidanceNote: policy.taxGuidanceNote ?? "",
      submissionWindowDays: String(policy.submissionWindowDays),
      spendingCardsEnabled: policy.spendingCardsEnabled,
    });
    setError(null);
    setShowForm(true);
  }

  function handleSave() {
    setError(null);
    const payload = {
      approverRoles: form.approverRoles,
      requiresMinutesApproval: form.requiresMinutesApproval,
      salesTaxRefundTracking: form.salesTaxRefundTracking,
      taxGuidanceNote: form.taxGuidanceNote,
      submissionWindowDays: Number.parseInt(form.submissionWindowDays, 10),
      spendingCardsEnabled: form.spendingCardsEnabled,
    };

    startTransition(async () => {
      try {
        if (editing) {
          await updateReimbursementPolicy(editing.id, payload);
        } else {
          await createReimbursementPolicy({
            state: form.state,
            district: form.district || null,
            policy: payload,
          });
        }
        setShowForm(false);
        setEditing(null);
        await load();
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't save that policy."));
      }
    });
  }

  async function handleDelete(policy: ReimbursementPolicyRow) {
    const scope = policy.state ?? `${policy.districtName}`;
    const ok = await confirm({
      title: `Delete the ${scope} policy?`,
      description:
        "Schools under it fall back to the next level — their state's rules, or the national default. Requests already submitted keep the approver roles snapshotted onto them, so nothing in flight changes.",
      confirmLabel: "Delete policy",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        await deleteReimbursementPolicy(policy.id);
        await load();
      } finally {
        closeConfirm();
      }
    });
  }

  function toggleRole(slug: string) {
    setForm((current) => ({
      ...current,
      approverRoles: current.approverRoles.includes(slug)
        ? current.approverRoles.filter((role) => role !== slug)
        : [...current.approverRoles, slug],
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading policies…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={startCreate} disabled={isPending}>
          <Plus className="h-4 w-4" />
          Add a policy
        </Button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-medium">
            {editing
              ? `Editing ${editing.state ?? editing.districtName}`
              : "New policy"}
          </h2>

          {error && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {/* Scope is fixed once created: a policy that could be moved between
              states would silently change which schools it governs. */}
          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="policy-state">State</Label>
                <select
                  id="policy-state"
                  value={form.state}
                  onChange={(e) =>
                    setForm({ ...form, state: e.target.value, district: "" })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Pick a state…</option>
                  {STATE_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>District (optional)</Label>
                <DistrictSelect
                  stateName={form.state}
                  value={form.district}
                  onChange={(value) => setForm({ ...form, district: value })}
                  placeholder="Leave empty for a state-wide policy"
                  disabled={!form.state}
                  allowCustom={false}
                />
                <p className="text-xs text-muted-foreground">
                  A district policy overrides its state&apos;s for the schools
                  in it.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Who has to approve a request</Label>
            <div className="flex flex-wrap gap-2">
              {STANDARD_BOARD_POSITIONS.map((position) => (
                <button
                  key={position.slug}
                  type="button"
                  onClick={() => toggleRole(position.slug)}
                  className={
                    form.approverRoles.includes(position.slug)
                      ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                  }
                >
                  {position.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Every one of these has to sign before a request reaches the
              treasurer to be paid. Two is the norm — Utah uses Treasurer and
              President, California Secretary and President.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-window">
              Substantiation window (days)
            </Label>
            <Input
              id="policy-window"
              inputMode="numeric"
              value={form.submissionWindowDays}
              onChange={(e) =>
                setForm({ ...form, submissionWindowDays: e.target.value })
              }
              className="max-w-32"
            />
            <p className="text-xs text-muted-foreground">
              Expenses older than this are flagged, never blocked. 60 days is
              the IRS accountable-plan safe harbour.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-tax-note">Tax guidance shown in the form</Label>
            <Textarea
              id="policy-tax-note"
              rows={2}
              value={form.taxGuidanceNote}
              onChange={(e) =>
                setForm({ ...form, taxGuidanceNote: e.target.value })
              }
              placeholder="e.g. Use the PTA's exemption number for purchases over $1,000."
            />
          </div>

          <PolicySwitch
            label="Association approval required on every request"
            description="California-style: approval needs a minutes reference whether or not the request is over budget."
            checked={form.requiresMinutesApproval}
            onChange={(value) =>
              setForm({ ...form, requiresMinutesApproval: value })
            }
          />
          <PolicySwitch
            label="State PTA refunds sales tax"
            description="Turns on the sales tax refund report. Tax is recorded on every request regardless."
            checked={form.salesTaxRefundTracking}
            onChange={(value) =>
              setForm({ ...form, salesTaxRefundTracking: value })
            }
          />
          <PolicySwitch
            label="Pre-funded spending cards allowed"
            description="Lets volunteers ask for a card instead of fronting their own money."
            checked={form.spendingCardsEnabled}
            onChange={(value) =>
              setForm({ ...form, spendingCardsEnabled: value })
            }
          />

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Create policy"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {policies.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No policies configured — every school is on the national default.
        </p>
      ) : (
        <ul className="space-y-3">
          {policies.map((policy) => (
            <li
              key={policy.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {policy.state ? (
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    )}
                    {policy.state ??
                      `${policy.districtName} (${policy.districtState})`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approved by {policy.approverRoles.join(" and ")} ·{" "}
                    {policy.submissionWindowDays}-day window
                    {policy.requiresMinutesApproval && " · minutes required"}
                    {policy.salesTaxRefundTracking && " · sales tax refund"}
                    {policy.spendingCardsEnabled && " · spending cards"}
                  </p>
                  {policy.taxGuidanceNote && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {policy.taxGuidanceNote}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(policy)}
                    disabled={isPending}
                    aria-label="Edit policy"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(policy)}
                    disabled={isPending}
                    aria-label="Delete policy"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmDialog}
    </div>
  );
}

function PolicySwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
