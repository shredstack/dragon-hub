"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { TagPicker } from "@/components/ui/tag-picker";
import {
  createContact,
  updateContact,
  deleteContact,
  setContactActive,
} from "@/actions/contacts";
import { CONTACT_CATEGORIES } from "@/lib/constants";
import type { SchoolContactWithUsage } from "@/types";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Phone,
  Mail,
  Globe,
  Search,
  Archive,
  ArchiveRestore,
  CalendarDays,
} from "lucide-react";

interface ContactsAdminProps {
  contacts: SchoolContactWithUsage[];
  availableTags: { name: string; displayName: string }[];
}

const EMPTY_FORM = {
  name: "",
  organization: "",
  category: "vendor",
  phone: "",
  email: "",
  website: "",
  address: "",
  notes: "",
  tags: [] as string[],
};

export function ContactsAdmin({ contacts, availableTags }: ContactsAdminProps) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const visible = useMemo(() => {
    const q = query.toLowerCase().trim();
    return contacts.filter((c) => {
      if (!showRetired && !c.isActive) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (!q) return true;
      return [c.name, c.organization, c.notes, ...(c.tags ?? [])]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [contacts, query, categoryFilter, showRetired]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(contact: SchoolContactWithUsage) {
    setForm({
      name: contact.name,
      organization: contact.organization ?? "",
      category: contact.category ?? "vendor",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      website: contact.website ?? "",
      address: contact.address ?? "",
      notes: contact.notes ?? "",
      tags: contact.tags ?? [],
    });
    setEditingId(contact.id);
    setError(null);
    setShowForm(true);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        if (editingId) {
          await updateContact(editingId, form);
        } else {
          await createContact(form);
        }
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save that contact."
        );
      }
    });
  }

  function handleDelete(contact: SchoolContactWithUsage) {
    const warning =
      contact.linkedEvents.length > 0
        ? `${contact.name} is attached to ${contact.linkedEvents.length} event${contact.linkedEvents.length === 1 ? "" : "s"}. Deleting removes them from all of them. Retiring instead keeps the history.\n\nDelete anyway?`
        : `Delete ${contact.name}?`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      await deleteContact(contact.id);
    });
  }

  function handleToggleActive(contact: SchoolContactWithUsage) {
    startTransition(async () => {
      await setContactActive(contact.id, !contact.isActive);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, organization, notes, tags..."
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {Object.entries(CONTACT_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {!showForm && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">
              {editingId ? "Edit Contact" : "Add Contact"}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
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
                value={form.organization}
                onChange={(e) =>
                  setForm((p) => ({ ...p, organization: e.target.value }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((p) => ({ ...p, category: e.target.value }))
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
              <label className="mb-1 block text-sm font-medium">Phone</label>
              <input
                value={form.phone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, phone: e.target.value }))
                }
                placeholder="(555) 123-4567"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) =>
                  setForm((p) => ({ ...p, website: e.target.value }))
                }
                placeholder="https://..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Address</label>
              <input
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({ ...p, address: e.target.value }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="e.g., Ask for Dana, PTA gets 15% off, needs 3 weeks notice, delivers before 8am"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <TagPicker
                value={form.tags}
                onChange={(t) => setForm((p) => ({ ...p, tags: t }))}
                available={availableTags}
                helpText="Tags are shared across DragonHub and configured under Tags in the PTA Board Hub."
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending || !form.name.trim()}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Save Changes" : "Add Contact"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Contacts ({visible.length})</h3>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />
          Show retired
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            {contacts.length === 0
              ? "No contacts yet. Add the vendors and people your PTA relies on."
              : "No contacts match those filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((contact) => (
            <div
              key={contact.id}
              className={`rounded-lg border border-border bg-card p-4 ${
                contact.isActive ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{contact.name}</span>
                    {contact.category && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {CONTACT_CATEGORIES[
                          contact.category as keyof typeof CONTACT_CATEGORIES
                        ] ?? contact.category}
                      </span>
                    )}
                    {!contact.isActive && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Retired
                      </span>
                    )}
                  </div>
                  {contact.organization && (
                    <p className="text-sm text-muted-foreground">
                      {contact.organization}
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
                  </div>

                  {contact.notes && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {contact.notes}
                    </p>
                  )}

                  {contact.linkedEvents.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {contact.linkedEvents.map((event) => (
                        <span
                          key={`${contact.id}-${event.id}`}
                          className="rounded-full bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-300"
                        >
                          {event.title}
                          {event.usedFor ? ` · ${event.usedFor}` : ""}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {contact.lastUsedYear && (
                      <span>Last used {contact.lastUsedYear}</span>
                    )}
                    {contact.tags && contact.tags.length > 0 && (
                      <span>
                        {contact.tags
                          .map(
                            (t) =>
                              availableTags.find((a) => a.name === t)
                                ?.displayName ?? t
                          )
                          .join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    title={contact.isActive ? "Retire" : "Restore"}
                    onClick={() => handleToggleActive(contact)}
                  >
                    {contact.isActive ? (
                      <Archive className="h-4 w-4" />
                    ) : (
                      <ArchiveRestore className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(contact)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(contact)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
