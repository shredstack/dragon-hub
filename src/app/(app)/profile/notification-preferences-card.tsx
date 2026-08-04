"use client";

import { useEffect, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import {
  getMyDevices,
  getMyNotificationSettings,
  resetNotificationPreferences,
  setPushEnabled,
  updateNotificationSetting,
  updateQuietHours,
  type MyDevice,
  type MyNotificationSettings,
} from "@/actions/notifications";
import { NOTIFICATION_GROUPS, NOTIFICATION_TYPES } from "@/lib/constants";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Notification settings, on /profile below the Email card.
 *
 * Self-fetching for the same reason `EmailPreferencesCard` is: these aren't
 * part of the profile record, and coupling them would mean a failed
 * preferences read blocks editing your name.
 */
export function NotificationPreferencesCard() {
  const [settings, setSettings] = useState<MyNotificationSettings | null>(null);
  const [devices, setDevices] = useState<MyDevice[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt" | "web">("web");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyNotificationSettings()
      .then(setSettings)
      .catch(() => setError("Couldn't load your notification settings."));
    getMyDevices().then(setDevices).catch(() => {});

    // Native only. On the web there is nothing to report and nothing to fix.
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { PushNotifications } = await import(
        "@capacitor/push-notifications"
      );
      const perm = await PushNotifications.checkPermissions();
      setPermission(
        perm.receive === "granted"
          ? "granted"
          : perm.receive === "denied"
            ? "denied"
            : "prompt"
      );
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: "dragonhub.push-token" });
      setCurrentToken(value);
    })().catch(() => {});
  }, []);

  if (!settings) {
    return error ? (
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </div>
    ) : null;
  }

  const patch = (next: Partial<MyNotificationSettings>) =>
    setSettings((s) => (s ? { ...s, ...next } : s));

  async function withSave(fn: () => Promise<void>, revert: () => void) {
    setSaving(true);
    setError(null);
    try {
      await fn();
    } catch {
      revert();
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function resolvedFor(type: string) {
    const spec = NOTIFICATION_TYPES[type as keyof typeof NOTIFICATION_TYPES];
    return settings!.overrides[type] ?? { ...spec.defaults };
  }

  async function toggle(type: string, channel: "inApp" | "push", value: boolean) {
    const before = settings!.overrides[type];
    const next = { ...resolvedFor(type), [channel]: value };
    patch({ overrides: { ...settings!.overrides, [type]: next } });
    await withSave(
      () => updateNotificationSetting(type, next),
      () => {
        const overrides = { ...settings!.overrides };
        if (before) overrides[type] = before;
        else delete overrides[type];
        patch({ overrides });
      }
    );
  }

  const groups = Object.entries(NOTIFICATION_GROUPS) as Array<
    [keyof typeof NOTIFICATION_GROUPS, string]
  >;

  return (
    <div
      id="notifications"
      className="mt-6 space-y-6 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notifications</h2>
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {permission === "denied" && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Notifications are turned off for DragonHub in your device settings.
          The switches below still control what lands in your inbox here, but
          nothing will reach your phone until you turn them back on in
          Settings → DragonHub → Notifications.
        </p>
      )}

      {/* ── Master switch ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="push-master" className="text-sm font-medium">
            Push notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            Send notifications to your phone. Turning this off keeps everything
            in your DragonHub inbox — you just won&apos;t be interrupted.
          </p>
        </div>
        <Switch
          id="push-master"
          checked={settings.pushEnabled}
          onCheckedChange={(v) => {
            patch({ pushEnabled: v });
            void withSave(
              () => setPushEnabled(v),
              () => patch({ pushEnabled: !v })
            );
          }}
        />
      </div>

      {/* ── Quiet hours ────────────────────────────────────────────────── */}
      <div>
        <Label className="text-sm font-medium">Quiet hours</Label>
        <p className="text-xs text-muted-foreground">
          No push between these times ({friendlyZone(settings.timeZone)}). A few
          things still come through — a spot opening up the night before, or
          someone mentioning you by name. Set both to the same time to switch
          quiet hours off.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <HourSelect
            label="From"
            value={settings.quietHoursStart}
            onChange={(v) => {
              const before = settings.quietHoursStart;
              patch({ quietHoursStart: v });
              void withSave(
                () => updateQuietHours(v, settings.quietHoursEnd),
                () => patch({ quietHoursStart: before })
              );
            }}
          />
          <HourSelect
            label="Until"
            value={settings.quietHoursEnd}
            onChange={(v) => {
              const before = settings.quietHoursEnd;
              patch({ quietHoursEnd: v });
              void withSave(
                () => updateQuietHours(settings.quietHoursStart, v),
                () => patch({ quietHoursEnd: before })
              );
            }}
          />
        </div>
      </div>

      {/* ── Per-type switches ──────────────────────────────────────────── */}
      {groups.map(([groupKey, groupLabel]) => {
        const types = Object.entries(NOTIFICATION_TYPES).filter(
          ([, spec]) =>
            spec.group === groupKey &&
            // A parent has no use for a switch controlling a notification only
            // board members can receive.
            (!("boardOnly" in spec && spec.boardOnly) || settings.isBoard)
        );
        if (types.length === 0) return null;

        return (
          <div key={groupKey}>
            <h3 className="mb-2 text-sm font-semibold">{groupLabel}</h3>
            <div className="space-y-3">
              {types.map(([type, spec]) => {
                const resolved = resolvedFor(type);
                return (
                  <div
                    key={type}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{spec.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {spec.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <label className="flex flex-col items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Inbox
                        </span>
                        <Switch
                          checked={resolved.inApp}
                          onCheckedChange={(v) => toggle(type, "inApp", v)}
                        />
                      </label>
                      <label className="flex flex-col items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Push
                        </span>
                        <Switch
                          checked={resolved.push && settings.pushEnabled}
                          disabled={!settings.pushEnabled}
                          onCheckedChange={(v) => toggle(type, "push", v)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            withSave(
              async () => {
                await resetNotificationPreferences();
                setSettings(await getMyNotificationSettings());
              },
              () => {}
            )
          }
        >
          Reset to defaults
        </Button>
      </div>

      {/* ── Devices ────────────────────────────────────────────────────── */}
      {devices.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Devices</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Phones and tablets signed in to your account that can receive
            notifications.
          </p>
          <ul className="space-y-2">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {d.deviceName ?? platformLabel(d.platform)}
                      {currentToken === d.token && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          this device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {platformLabel(d.platform)}
                      {d.appVersion ? ` · v${d.appVersion}` : ""} · last active{" "}
                      {new Date(d.lastSeenAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await fetch(
                      `/api/push-tokens?token=${encodeURIComponent(d.token)}`,
                      { method: "DELETE", credentials: "include" }
                    );
                    setDevices((ds) => ds.filter((x) => x.id !== d.id));
                  }}
                >
                  Sign out
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function HourSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      >
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
    </label>
  );
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
}

/** "America/Denver" → "Mountain Time", falling back to the raw zone. */
function friendlyZone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "long",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function platformLabel(platform: "ios" | "android"): string {
  return platform === "ios" ? "iPhone or iPad" : "Android";
}
