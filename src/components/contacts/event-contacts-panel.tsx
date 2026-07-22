"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  getEventContacts,
  getLinkableContacts,
  linkContact,
  createAndLinkContact,
  unlinkContact,
  promoteContactToCatalog,
  type ContactTarget,
} from "@/actions/contacts";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CONTACT_CATEGORIES } from "@/lib/constants";
import type { EventContact } from "@/types";
import {
  Plus,
  Phone,
  Mail,
  Globe,
  MapPin,
  Trash2,
  Loader2,
  Contact as ContactIcon,
  ArrowUpCircle,
  Repeat,
  X,
} from "lucide-react";

interface EventContactsPanelProps {
  target: ContactTarget;
  canEdit: boolean;
  /** Leads can detach contacts; ordinary members can only add. */
  canRemove?: boolean;
  /** False when a plan has no recurring event, which disables promoting. */
  canPromote?: boolean;
}

type Mode = "existing" | "new";

interface LinkableContact {
  id: string;
  name: string;
  organization: string | null;
  category: string | null;
  lastUsedYear: string | null;
}

export function EventContactsPanel({
  target,
  canEdit,
  canRemove = canEdit,
  canPromote = false,
}: EventContactsPanelProps) {
  const [contacts, setContacts] = useState<EventContact[] | null>(null);
  const [linkable, setLinkable] = useState<LinkableContact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<Mode>("existing");
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [existingId, setExistingId] = useState("");
  const [usedFor, setUsedFor] = useState("");
  const [newContact, setNewContact] = useState({
    name: "",
    organization: "",
    category: "vendor",
    phone: "",
    email: "",
    website: "",
    notes: "",
  });

  const targetKey = `${target.type}:${target.id}`;

  const load = useCallback(async () => {
    const [current, options] = await Promise.all([
      getEventContacts(target),
      canEdit ? getLinkableContacts(target) : Promise.resolve([]),
    ]);
    setContacts(current);
    setLinkable(options);
    // target is reconstructed each render by the parent; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, canEdit]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setShowForm(false);
    setExistingId("");
    setUsedFor("");
    setError(null);
    setNewContact({
      name: "",
      organization: "",
      category: "vendor",
      phone: "",
      email: "",
      website: "",
      notes: "",
    });
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "existing") {
          if (!existingId) {
            setError("Pick a contact to add");
            return;
          }
          await linkContact({
            contactId: existingId,
            target,
            usedFor: usedFor || undefined,
          });
        } else {
          if (!newContact.name.trim()) {
            setError("Give this contact a name");
            return;
          }
          await createAndLinkContact({
            target,
            usedFor: usedFor || undefined,
            contact: newContact,
          });
        }
        resetForm();
        await load();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not add that contact."
        );
      }
    });
  }

  async function handleUnlink(contact: EventContact) {
    const ok = await confirm({
      title: `Remove ${contact.name} from this event?`,
      description:
        contact.source === "catalog"
          ? "They stop appearing on every year's plan for this recurring event, but stay in the contact directory."
          : "They stay in the contact directory — this only removes the link to this event.",
      confirmLabel: "Remove",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        await unlinkContact(contact.linkId);
        await load();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not remove that contact."
        );
      } finally {
        closeConfirm();
      }
    });
  }

  function handlePromote(contact: EventContact) {
    startTransition(async () => {
      try {
        await promoteContactToCatalog(contact.linkId);
        await load();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save that contact for future years."
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <ContactIcon className="h-4 w-4" />
            Useful Contact Info
          </h3>
          <p className="text-xs text-muted-foreground">
            {target.type === "catalog"
              ? "Contacts here appear on every year's plan for this event."
              : "Vendors and people worth having on hand for this event."}
          </p>
        </div>
        {canEdit && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              {(
                [
                  { value: "existing", label: "From directory" },
                  { value: "new", label: "New contact" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === option.value
                      ? "bg-dragon-blue-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            {mode === "existing" ? (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Contact
                </label>
                {linkable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Every contact in the directory is already on this event.
                    Switch to &ldquo;New contact&rdquo; to add another.
                  </p>
                ) : (
                  <select
                    value={existingId}
                    onChange={(e) => setExistingId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select a contact...</option>
                    {linkable.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.organization ? ` — ${c.organization}` : ""}
                        {c.lastUsedYear ? ` (last used ${c.lastUsedYear})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={newContact.name}
                    onChange={(e) =>
                      setNewContact((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g., Jump Around Rentals"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Organization
                  </label>
                  <input
                    value={newContact.organization}
                    onChange={(e) =>
                      setNewContact((p) => ({
                        ...p,
                        organization: e.target.value,
                      }))
                    }
                    placeholder="e.g., Party Rentals of Austin"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Category
                  </label>
                  <select
                    value={newContact.category}
                    onChange={(e) =>
                      setNewContact((p) => ({ ...p, category: e.target.value }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Object.entries(CONTACT_CATEGORIES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Phone
                  </label>
                  <input
                    value={newContact.phone}
                    onChange={(e) =>
                      setNewContact((p) => ({ ...p, phone: e.target.value }))
                    }
                    placeholder="(555) 123-4567"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={(e) =>
                      setNewContact((p) => ({ ...p, email: e.target.value }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Website
                  </label>
                  <input
                    type="url"
                    value={newContact.website}
                    onChange={(e) =>
                      setNewContact((p) => ({ ...p, website: e.target.value }))
                    }
                    placeholder="https://..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={newContact.notes}
                    onChange={(e) =>
                      setNewContact((p) => ({ ...p, notes: e.target.value }))
                    }
                    placeholder="e.g., Ask for Dana, PTA gets 15% off, needs 3 weeks notice"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                What are they for?
              </label>
              <input
                value={usedFor}
                onChange={(e) => setUsedFor(e.target.value)}
                placeholder="e.g., bounce houses, bulk cookies, sound system"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Contact
              </Button>
              <Button size="sm" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {contacts === null ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading contacts...
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No contacts yet. Add the vendors and people whoever runs this next
            year will wish they had.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.linkId}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{contact.name}</span>
                    {contact.usedFor && (
                      <span className="rounded-full bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-300">
                        {contact.usedFor}
                      </span>
                    )}
                    {contact.source === "catalog" && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        title="Comes from the recurring event — appears every year"
                      >
                        <Repeat className="h-3 w-3" /> Every year
                      </span>
                    )}
                  </div>
                  {contact.organization && (
                    <p className="text-sm text-muted-foreground">
                      {contact.organization}
                      {contact.category
                        ? ` · ${
                            CONTACT_CATEGORIES[
                              contact.category as keyof typeof CONTACT_CATEGORIES
                            ] ?? contact.category
                          }`
                        : ""}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1 text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                      >
                        <Phone className="h-3.5 w-3.5" /> {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1 text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                      >
                        <Mail className="h-3.5 w-3.5" /> {contact.email}
                      </a>
                    )}
                    {contact.website && (
                      <a
                        href={contact.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                      >
                        <Globe className="h-3.5 w-3.5" /> Website
                      </a>
                    )}
                    {contact.address && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" /> {contact.address}
                      </span>
                    )}
                  </div>

                  {contact.notes && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {contact.notes}
                    </p>
                  )}
                  {contact.lastUsedYear && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last used {contact.lastUsedYear}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {canPromote &&
                    contact.source === "plan" &&
                    target.type === "plan" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Save for future years"
                        disabled={isPending}
                        onClick={() => handlePromote(contact)}
                      >
                        <ArrowUpCircle className="h-4 w-4" />
                        <span className="sr-only">Save for future years</span>
                      </Button>
                    )}
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleUnlink(contact)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  )}
                </div>
              </div>

              {canPromote &&
                contact.source === "plan" &&
                target.type === "plan" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Only on this year&rsquo;s event.{" "}
                    <button
                      type="button"
                      onClick={() => handlePromote(contact)}
                      className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                    >
                      Save for future years
                    </button>
                  </p>
                )}
            </div>
          ))}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
