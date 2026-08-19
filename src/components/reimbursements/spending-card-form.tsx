"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { requestSpendingCard } from "@/actions/spending-cards";
import { actionErrorMessage } from "@/lib/action-error";

const GENERAL_OPTION = "__general__";

interface SpendingCardFormProps {
  eventPlanOptions: { id: string; title: string }[];
  budgetCategoryOptions: { id: string; name: string }[];
  canRequestGeneral: boolean;
  lockedEventPlanId?: string | null;
}

/**
 * Asking for a pre-funded card.
 *
 * One screen rather than a wizard: there is no receipt yet — that is the whole
 * point of a card — so the only things to say are what it is for, how much, and
 * which budget line it comes off.
 */
export function SpendingCardForm({
  eventPlanOptions,
  budgetCategoryOptions,
  canRequestGeneral,
  lockedEventPlanId = null,
}: SpendingCardFormProps) {
  const router = useRouter();
  const [eventPlanId, setEventPlanId] = useState<string | null>(
    lockedEventPlanId
  );
  const [eventLabel, setEventLabel] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [budgetCategoryId, setBudgetCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const created = await requestSpendingCard({
        eventPlanId,
        eventLabel: eventPlanId ? null : eventLabel,
        purpose,
        requestedAmount: amount,
        budgetCategoryId,
      });
      router.push(`/reimbursements/cards/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't send that request."));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {!lockedEventPlanId && (
        <div className="space-y-2">
          <Label htmlFor="card-event">What is the card for?</Label>
          <Select
            value={eventPlanId ?? (canRequestGeneral ? GENERAL_OPTION : "")}
            onValueChange={(value) =>
              setEventPlanId(value === GENERAL_OPTION ? null : value)
            }
          >
            <SelectTrigger id="card-event">
              <SelectValue placeholder="Pick the event" />
            </SelectTrigger>
            <SelectContent>
              {eventPlanOptions.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.title}
                </SelectItem>
              ))}
              {canRequestGeneral && (
                <SelectItem value={GENERAL_OPTION}>
                  General (non-event)
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {!eventPlanId && canRequestGeneral && (
            <Input
              value={eventLabel}
              onChange={(e) => setEventLabel(e.target.value)}
              placeholder="What it's for — e.g. office supplies restock"
            />
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="card-purpose">What will you buy?</Label>
        <Textarea
          id="card-purpose"
          rows={3}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Prizes, decorations and paper goods for the carnival booths"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="card-amount">How much do you need?</Label>
          <Input
            id="card-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="card-category">Budget line (optional)</Label>
          <Select
            value={budgetCategoryId ?? ""}
            onValueChange={(value) => setBudgetCategoryId(value || null)}
          >
            <SelectTrigger id="card-category">
              <SelectValue placeholder="The treasurer can set this" />
            </SelectTrigger>
            <SelectContent>
              {budgetCategoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        A card still needs receipts. Photograph every one and add it to this
        request as you go — the treasurer has to account for the whole loaded
        amount, and anything unspent goes back to the PTA.
      </p>

      <Button onClick={handleSubmit} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Send the request
      </Button>
    </div>
  );
}
