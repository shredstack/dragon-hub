"use client";

import { useEffect, useState } from "react";
import { Bell, MessageSquare, ClipboardList, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPushPrimerState,
  markPushDismissed,
  markPushPrimed,
  shouldShowPrimer,
} from "@/lib/native-preferences";

/**
 * The screen that asks before the OS asks.
 *
 * The app used to call `requestPermissions()` on first launch, unexplained.
 * That is the worst possible pattern for two separate reasons:
 *
 *  - **It's one-shot.** iOS shows the system alert exactly once per install. A
 *    "Don't Allow" tapped by reflex at second three is permanent — the only way
 *    back is Settings, which nobody finds.
 *  - **App Store Guideline 4.2** wants evidence the app is more than a website
 *    in a wrapper. A permission prompt with a reason, shown at a moment that
 *    makes sense, is exactly the evidence a reviewer looks for.
 *
 * So this sheet explains what DragonHub sends *by name* first, and only calls
 * `requestPermissions()` when the parent taps the affirmative button — meaning
 * the system alert only ever appears after somebody has already said yes once.
 */
export function PushPrimer({ onDecided }: { onDecided: () => void }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { PushNotifications } = await import(
        "@capacitor/push-notifications"
      );
      const perm = await PushNotifications.checkPermissions();

      // Already answered at the OS level — nothing to prime. `denied` is
      // handled on /profile, which is somewhere the user can act on it.
      if (perm.receive === "granted" || perm.receive === "denied") {
        onDecided();
        return;
      }

      const state = await getPushPrimerState();
      if (cancelled) return;
      if (shouldShowPrimer(state)) setVisible(true);
      else onDecided();
    })().catch(() => onDecided());

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  async function allow() {
    setBusy(true);
    try {
      const { PushNotifications } = await import(
        "@capacitor/push-notifications"
      );
      await markPushPrimed();
      const result = await PushNotifications.requestPermissions();
      if (result.receive === "granted") {
        // Registration is what actually produces a token; the bridge's
        // `registration` listener posts it to /api/push-tokens.
        await PushNotifications.register();
      }
    } catch (err) {
      console.warn("Push permission request failed", err);
    } finally {
      setBusy(false);
      setVisible(false);
      onDecided();
    }
  }

  async function notNow() {
    await markPushDismissed().catch(() => {});
    setVisible(false);
    onDecided();
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={notNow}
          aria-label="Not now"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 pb-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Bell className="h-8 w-8 text-primary" />
        </div>

        <h1 className="mt-6 text-center text-2xl font-bold">
          Don&apos;t miss what matters
        </h1>
        <p className="mt-2 text-center text-muted-foreground">
          DragonHub can let you know when something actually needs you. You
          choose exactly which of these later, in Profile.
        </p>

        <ul className="mx-auto mt-8 max-w-sm space-y-4">
          <PrimerRow
            icon={<MessageSquare className="h-5 w-5" />}
            title="Messages on your boards"
            body="A post in your classroom, your committee, or an event you're helping with — and when someone types your name."
          />
          <PrimerRow
            icon={<ClipboardList className="h-5 w-5" />}
            title="Tasks and reminders"
            body="When a task is assigned to you, and the day before one is due."
          />
          <PrimerRow
            icon={<UserCheck className="h-5 w-5" />}
            title="When a spot opens up"
            body="If you're on a waitlist and a place comes free, you'll know right away."
          />
        </ul>

        <p className="mx-auto mt-6 max-w-sm text-center text-xs text-muted-foreground">
          Quiet hours are on by default, so nothing buzzes overnight.
        </p>

        <div className="mx-auto mt-8 w-full max-w-sm space-y-2">
          <Button onClick={allow} disabled={busy} className="w-full">
            Turn on notifications
          </Button>
          <Button
            variant="outline"
            onClick={notNow}
            disabled={busy}
            className="w-full"
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

function PrimerRow({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}
