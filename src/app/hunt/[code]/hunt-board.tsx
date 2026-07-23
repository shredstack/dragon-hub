"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  claimFinisherContact,
  startHunt,
  toggleHuntItem,
  type PublicHunt,
  type PublicHuntItem,
} from "@/actions/scavenger-hunts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Leaderboard } from "./leaderboard";
import { Confetti } from "./confetti";

export function HuntBoard({ hunt }: { hunt: PublicHunt }) {
  if (!hunt.participant) {
    return <Landing hunt={hunt} />;
  }
  return <Board hunt={hunt} />;
}

// ─── Landing ───────────────────────────────────────────────────────────────

function Landing({ hunt }: { hunt: PublicHunt }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    const result = await startHunt(hunt.code);
    if (!result.success) {
      setError(result.error ?? "Couldn't start the hunt. Please try again.");
      setIsStarting(false);
      return;
    }
    // The cookie is set server-side; refreshing re-renders the page as the
    // board, with the participant resolved from it.
    router.refresh();
  };

  return (
    <div className="min-h-dvh bg-muted px-4 py-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 text-6xl">🔎</div>
        <h1 className="text-3xl font-bold">{hunt.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{hunt.schoolName}</p>

        <div className="mt-6 rounded-xl border border-border bg-card p-6 text-left shadow-sm">
          {hunt.intro && (
            <p className="whitespace-pre-line text-muted-foreground">
              {hunt.intro}
            </p>
          )}

          <div className="mt-4 rounded-lg bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">
              There {hunt.totalItems === 1 ? "is" : "are"}
            </p>
            <p className="text-3xl font-bold">{hunt.totalItems}</p>
            <p className="text-sm text-muted-foreground">
              thing{hunt.totalItems === 1 ? "" : "s"} to find
            </p>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            No sign-in, no app. We&apos;ll give you a secret code name for the
            leaderboard.
          </p>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}

          <Button
            className="mt-6 h-14 w-full text-lg"
            onClick={handleStart}
            disabled={isStarting}
          >
            {isStarting ? "Starting…" : "Start the hunt"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────

function Board({ hunt }: { hunt: PublicHunt }) {
  const { addToast } = useToast();
  const participant = hunt.participant!;

  const [items, setItems] = useState<PublicHuntItem[]>(hunt.items);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [finishRank, setFinishRank] = useState<number | null>(
    participant.finishRank
  );
  // Distinguishes "just finished, celebrate" from "came back to a finished
  // hunt", which should not throw confetti on every refresh.
  const [celebrating, setCelebrating] = useState(false);
  const [showFinish, setShowFinish] = useState(Boolean(participant.finishedAt));

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const isFinished = total > 0 && completed >= total;

  const handleToggle = async (item: PublicHuntItem) => {
    if (pending.has(item.id)) return;

    // Optimistic: the tap has to feel instant in a loud gym on bad wifi.
    const previous = items;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i))
    );
    setPending((prev) => new Set(prev).add(item.id));

    try {
      const result = await toggleHuntItem(hunt.code, item.id);
      if (!result.success) {
        setItems(previous);
        addToast(result.error ?? "That didn't save. Try again.", "destructive");
        return;
      }
      // Trust the server's view over the optimistic one.
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, done: result.done! } : i))
      );
      if (result.justFinished) {
        setFinishRank(result.finishRank ?? null);
        setCelebrating(true);
        setShowFinish(true);
      }
    } catch (err) {
      console.error("Failed to toggle item:", err);
      setItems(previous);
      addToast("That didn't save. Check your signal and try again.", "destructive");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  if (showFinish && isFinished) {
    return (
      <FinishScreen
        hunt={hunt}
        rank={finishRank}
        celebrating={celebrating}
        onBack={() => {
          setCelebrating(false);
          setShowFinish(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-muted">
      {/* Sticky header: progress and identity stay visible while scrolling. */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 p-4">
          <ProgressRing completed={completed} total={total} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {participant.handleEmoji} {participant.handle}
            </p>
            <p className="text-xs text-muted-foreground">
              {completed === total
                ? "All done!"
                : `${total - completed} to go · screenshot your name!`}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-4">
        <Tabs defaultValue="hunt">
          <TabsList>
            <TabsTrigger value="hunt" className="flex-1">
              Hunt
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1">
              Leaderboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hunt">
            <h1 className="mb-1 text-xl font-bold">{hunt.title}</h1>
            {hunt.intro && (
              <p className="mb-4 whitespace-pre-line text-sm text-muted-foreground">
                {hunt.intro}
              </p>
            )}

            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                      item.done
                        ? "border-green-300 bg-green-50"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="shrink-0 text-3xl" aria-hidden="true">
                      {item.emoji}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-medium ${
                          item.done ? "text-muted-foreground line-through" : ""
                        }`}
                      >
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      {item.linkUrl && (
                        <a
                          href={item.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex min-h-[44px] items-center rounded-lg border border-dragon-blue-300 px-3 text-sm font-medium text-dragon-blue-600 hover:bg-dragon-blue-50"
                        >
                          {item.linkLabel || "Open link"}
                        </a>
                      )}
                    </div>

                    {/* 44x44 minimum: this is tapped one-handed while holding
                        a kindergartener. */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      disabled={pending.has(item.id)}
                      aria-pressed={item.done}
                      aria-label={
                        item.done
                          ? `Mark "${item.title}" as not done`
                          : `Mark "${item.title}" as done`
                      }
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-xl transition-colors disabled:opacity-60 ${
                        item.done
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-border bg-card hover:border-dragon-blue-400"
                      }`}
                    >
                      {item.done ? "✓" : ""}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="leaderboard">
            <Leaderboard code={hunt.code} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Progress ring ─────────────────────────────────────────────────────────

function ProgressRing({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const pct = total === 0 ? 0 : completed / total;

  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-muted"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="stroke-dragon-blue-500 transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
        {completed}/{total}
      </span>
    </div>
  );
}

// ─── Finish ────────────────────────────────────────────────────────────────

function ordinal(n: number) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

function FinishScreen({
  hunt,
  rank,
  celebrating,
  onBack,
}: {
  hunt: PublicHunt;
  rank: number | null;
  celebrating: boolean;
  onBack: () => void;
}) {
  const participant = hunt.participant!;

  return (
    <div className="min-h-dvh bg-muted px-4 py-8">
      {celebrating && <Confetti />}

      <div className="mx-auto max-w-md text-center">
        <div className="text-6xl">🎉</div>
        <h1 className="mt-4 text-3xl font-bold">You did it!</h1>
        <p className="mt-2 text-lg">
          {participant.handleEmoji} {participant.handle}
        </p>

        {rank !== null && (
          <p className="mt-4 text-muted-foreground">
            You were the{" "}
            <span className="text-xl font-bold text-foreground">
              {ordinal(rank)}
            </span>{" "}
            to finish!
          </p>
        )}

        {hunt.completionMessage && (
          <div className="mt-6 rounded-xl border border-dragon-gold-500 bg-dragon-gold-500/10 p-4">
            <p className="whitespace-pre-line font-medium">
              {hunt.completionMessage}
            </p>
          </div>
        )}

        {hunt.collectFinisherContact && !participant.hasClaimedContact && (
          <ClaimForm code={hunt.code} />
        )}

        {participant.hasClaimedContact && (
          <p className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            ✓ We&apos;ve got your details — come find us at the PTA table.
          </p>
        )}

        {/* The hunt's real conversion goal: into a volunteer campaign, which
            is also the on-ramp to DragonHub (its welcome email carries a
            one-tap login for this school). */}
        {hunt.finisherCta && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <p className="font-medium">Had fun? Come help us run it.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us what you&apos;d be interested in helping with — it takes a
              minute and isn&apos;t a commitment. We&apos;ll email you a one-tap
              link into {hunt.schoolName} on DragonHub, no password needed.
            </p>
            <a href={hunt.finisherCta.url}>
              <Button className="mt-3 h-12 w-full">
                {hunt.finisherCta.campaignTitle} →
              </Button>
            </a>
          </div>
        )}

        <Button variant="outline" className="mt-6 w-full" onClick={onBack}>
          Back to my list
        </Button>
      </div>
    </div>
  );
}

function ClaimForm({ code }: { code: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await claimFinisherContact(code, { name, email });
    if (!result.success) {
      setError(result.error ?? "Couldn't save that. Please try again.");
      setIsSaving(false);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  if (saved) {
    return (
      <p className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">
        ✓ Thanks! Come find us at the PTA table to pick up your prize.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-xl border border-border bg-card p-4 text-left"
    >
      <p className="font-medium">Claim your prize</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Optional — just so we know who to hand it to. A grown-up&apos;s name,
        please.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <Label htmlFor="claim-name">Your name</Label>
          <Input
            id="claim-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
            autoComplete="name"
          />
        </div>
        <div>
          <Label htmlFor="claim-email">Email</Label>
          <Input
            id="claim-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@example.com"
            autoComplete="email"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="mt-4 h-12 w-full"
        disabled={isSaving || !name.trim() || !email.trim()}
      >
        {isSaving ? "Saving…" : "Save my details"}
      </Button>
    </form>
  );
}
