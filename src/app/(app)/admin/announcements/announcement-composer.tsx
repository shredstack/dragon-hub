"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Send } from "lucide-react";
import {
  previewAnnouncementRecipients,
  sendAnnouncement,
  type AnnouncementAudience,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { actionErrorMessage } from "@/lib/action-error";
import { haptic } from "@/lib/haptics";

interface Option {
  id: string;
  name: string;
}

type AudienceKind = AnnouncementAudience["kind"];

export function AnnouncementComposer({
  committees,
  classrooms,
  sent,
}: {
  committees: Option[];
  classrooms: Option[];
  sent: Array<{ title: string; body: string; sentAt: Date; recipients: number }>;
}) {
  const router = useRouter();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<AudienceKind>("everyone");
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<{
    people: number;
    devices: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const audience: AnnouncementAudience | null =
    kind === "everyone" || kind === "board"
      ? { kind }
      : targetId
        ? { kind, id: targetId }
        : null;

  // A live recipient count, because "everyone" is an abstraction until it says
  // 340. Debounced so flipping through the classroom list isn't 20 round trips.
  useEffect(() => {
    if (!audience) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      previewAnnouncementRecipients(audience)
        .then((p) => {
          if (!cancelled) setPreview(p);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, targetId]);

  async function handleSend() {
    if (!audience) return;
    setError(null);
    setSuccess(null);

    const people = preview?.people ?? 0;
    const devices = preview?.devices ?? 0;
    // There is no undo on a push notification, so the count goes in the
    // confirmation rather than only next to the picker.
    const ok = await confirm({
      title: "Send this announcement?",
      description:
        `This notifies ${people} ${people === 1 ? "person" : "people"}` +
        (devices > 0
          ? `, and pushes to ${devices} ${devices === 1 ? "device" : "devices"} right away.`
          : ". Nobody has the app installed yet, so it will wait in their DragonHub inbox.") +
        " Announcements can't be unsent.",
      confirmLabel: "Send announcement",
    });
    if (!ok) return;

    setSending(true);
    try {
      const result = await sendAnnouncement({ title, body, audience });
      haptic("success");
      setSuccess(
        `Sent to ${result.sent} ${result.sent === 1 ? "person" : "people"}.`
      );
      setTitle("");
      setBody("");
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't send that announcement."));
    } finally {
      setSending(false);
      closeConfirm();
    }
  }

  const canSend = !!audience && title.trim() && body.trim() && !sending;

  return (
    <>
      <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <Label htmlFor="ann-title">Title</Label>
          <input
            id="ann-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Fun Run moved to Friday"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            This is the bold line on a lock screen. Keep it short enough to read
            at a glance.
          </p>
        </div>

        <div>
          <Label htmlFor="ann-body">Message</Label>
          <textarea
            id="ann-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={400}
            placeholder="Rain moved the Fun Run to Friday at 9am. Same field, same volunteer shifts."
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <Label htmlFor="ann-audience">Who gets this</Label>
          <select
            id="ann-audience"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as AudienceKind);
              setTargetId("");
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="everyone">Everyone at the school</option>
            <option value="board">PTA Board only</option>
            <option value="committee">One committee</option>
            <option value="classroom">One classroom</option>
          </select>

          {(kind === "committee" || kind === "classroom") && (
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">
                Choose a {kind === "committee" ? "committee" : "classroom"}…
              </option>
              {(kind === "committee" ? committees : classrooms).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {preview && (
            <p className="mt-2 text-sm text-muted-foreground">
              <strong className="text-foreground">{preview.people}</strong>{" "}
              {preview.people === 1 ? "person" : "people"}
              {preview.devices > 0 && (
                <>
                  {" · "}
                  <strong className="text-foreground">
                    {preview.devices}
                  </strong>{" "}
                  {preview.devices === 1 ? "device" : "devices"} will get a push
                </>
              )}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">
            {success}
          </p>
        )}

        <Button onClick={handleSend} disabled={!canSend} className="w-full">
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send announcement
        </Button>

        <p className="text-xs text-muted-foreground">
          Up to 5 announcements a day. A school that hears from the board every
          hour stops hearing from it at all.
        </p>
      </div>

      {sent.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="h-4 w-4" />
            Recently sent
          </h2>
          <ul className="divide-y divide-border">
            {sent.map((s, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(s.sentAt).toLocaleString()} · {s.recipients}{" "}
                  {s.recipients === 1 ? "recipient" : "recipients"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmDialog}
    </>
  );
}
