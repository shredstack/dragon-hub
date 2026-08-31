"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidRelayAddresses } from "@/lib/mail-merge-shared";

/**
 * Hand the email to one person instead of sending it to its audience.
 *
 * Many schools have stopped letting the PTA email families directly —
 * everything goes through the office and out on ParentSquare. The board still
 * knows exactly who the email is for; it just isn't the one pressing send.
 *
 * So this changes the To line and **nothing else**. The audience is still built
 * from the classrooms below, still counted, and still available as a list to
 * copy — because reproducing it at the other end is the office's whole job, and
 * DragonHub is the only thing that knows who it is. Emptying this field puts
 * the audience back in the To line.
 */
export function RelayField({
  relayTo,
  relayName,
  onChange,
}: {
  relayTo: string;
  relayName: string;
  onChange: (patch: { relayTo?: string; relayName?: string }) => void;
}) {
  const invalid = invalidRelayAddresses(relayTo);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium">Send it to one person instead</p>
        <p className="mt-1 text-xs text-muted-foreground">
          For a school that sends through the office. The email is addressed to
          them, and everyone it&apos;s <em>meant</em> to reach travels with it as
          a list they can copy — put{" "}
          <code className="text-dragon-blue-500">{"{{audience_emails}}"}</code>{" "}
          in the message, or use the copy button on the Send tab. Leave blank to
          address it to the audience as usual.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="mailing-relay-to" className="text-xs">
            Their email
          </Label>
          <Input
            id="mailing-relay-to"
            type="text"
            value={relayTo}
            onChange={(e) => onChange({ relayTo: e.target.value })}
            placeholder="secretary@school.org"
            aria-invalid={invalid.length > 0}
          />
        </div>
        <div>
          <Label htmlFor="mailing-relay-name" className="text-xs">
            Their name, for the greeting
          </Label>
          <Input
            id="mailing-relay-name"
            value={relayName}
            onChange={(e) => onChange({ relayName: e.target.value })}
            placeholder="Melissa"
          />
        </div>
      </div>

      {invalid.length > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          That doesn&apos;t look like an email address: {invalid.join(", ")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Separate several with commas if you want to copy yourself. Their name
          merges as{" "}
          <code className="text-dragon-blue-500">{"{{relay_name}}"}</code>.
        </p>
      )}
    </div>
  );
}
