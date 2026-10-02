"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ContactFields,
  useContactFields,
  type ContactFieldsState,
  type ContactValue,
} from "@/components/volunteer/contact-fields";
import { searchSchoolPeople } from "@/actions/people-search";
import type { PersonOption } from "@/lib/person-option";
import { formatPhoneInput, formatPhoneNumber, getInitials } from "@/lib/utils";

/**
 * "Who are we adding?" for every board dialog that seats a person somewhere —
 * a room, a committee, or several at once from the member directory.
 *
 * It starts as a search over people already at the school, because the common
 * case is someone who signed up once and has now agreed to a second job, and
 * retyping her name, email and phone was the whole form. "Someone new" falls
 * back to the same `ContactFields` the public signup forms use.
 *
 * Either way the result is a name/email/phone in `contact.value`: the server
 * actions behind these dialogs key off the email, so an existing member and a
 * newly typed one travel the same path and land on the same account.
 */

type Mode = "search" | "new";

export interface PersonPickerState {
  /** The existing member picked, or null while searching / entering someone new. */
  person: PersonOption | null;
  /** True once the board has switched to typing in someone new. */
  isNew: boolean;
  /** Name / email / phone, filled from `person` or typed by hand. */
  contact: ContactValue;
  isComplete: boolean;
  /** Paints any bad field. Call before submitting. */
  validate: () => boolean;
  /** Back to a blank search, or straight to `initial` when one is given. */
  reset: (initial?: PersonOption | null) => void;
  pickerProps: PersonPickerProps;
}

function contactFrom(person: PersonOption): Partial<ContactValue> {
  return {
    name: person.name ?? "",
    email: person.email,
    phone: person.phone ? formatPhoneInput(person.phone) : "",
  };
}

export function usePersonPicker(): PersonPickerState {
  const contact = useContactFields();
  const [person, setPerson] = useState<PersonOption | null>(null);
  const [mode, setMode] = useState<Mode>("search");

  const resetContact = contact.reset;
  // Stable, so a dialog can call `reset` from an effect keyed on `open`.
  const select = useCallback(
    (next: PersonOption | null = null) => {
      setPerson(next);
      setMode("search");
      resetContact(next ? contactFrom(next) : undefined);
    },
    [resetContact]
  );

  return {
    person,
    isNew: mode === "new",
    contact: contact.value,
    // A picked member is complete unless the account never had a name, which
    // the server needs for the roster — the picker asks for one in that case.
    isComplete: (person !== null || mode === "new") && contact.isComplete,
    validate: contact.validate,
    reset: select,
    pickerProps: {
      person,
      mode,
      contact,
      onSelect: select,
      onStartNew: (prefill) => {
        setPerson(null);
        setMode("new");
        contact.reset(prefill);
      },
      onBackToSearch: () => select(null),
    },
  };
}

export interface PersonPickerProps {
  person: PersonOption | null;
  mode: Mode;
  contact: ContactFieldsState;
  onSelect: (person: PersonOption | null) => void;
  onStartNew: (prefill?: Partial<ContactValue>) => void;
  onBackToSearch: () => void;
}

interface DisplayProps {
  idPrefix: string;
  disabled?: boolean;
  /** Hide the "Change" button — for a dialog opened on one specific member. */
  locked?: boolean;
}

export function PersonPicker({
  person,
  mode,
  contact,
  onSelect,
  onStartNew,
  onBackToSearch,
  idPrefix,
  disabled,
  locked,
}: PersonPickerProps & DisplayProps) {
  if (person) {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <PersonSummary person={person} />
          {!locked && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onSelect(null)}
              disabled={disabled}
            >
              Change
            </Button>
          )}
        </div>
        {!person.name && (
          <div>
            <Label htmlFor={`${idPrefix}-name`}>Full name *</Label>
            <Input
              id={`${idPrefix}-name`}
              value={contact.value.name}
              onChange={(e) => contact.fieldProps.onChange({ name: e.target.value })}
              placeholder="Jane Smith"
              disabled={disabled}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Their account doesn&apos;t have a name yet, and the roster needs one.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (mode === "new") {
    return (
      <div className="space-y-3">
        <ContactFields
          {...contact.fieldProps}
          variant="board"
          idPrefix={idPrefix}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onBackToSearch}
          className="text-sm font-medium text-dragon-blue-600 hover:underline"
          disabled={disabled}
        >
          ← Search existing members instead
        </button>
      </div>
    );
  }

  return (
    <PersonSearch
      idPrefix={idPrefix}
      disabled={disabled}
      onSelect={onSelect}
      onStartNew={onStartNew}
    />
  );
}

function PersonSearch({
  idPrefix,
  disabled,
  onSelect,
  onStartNew,
}: {
  idPrefix: string;
  disabled?: boolean;
  onSelect: (person: PersonOption) => void;
  onStartNew: (prefill?: Partial<ContactValue>) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Responses can land out of order; only the newest query's answer counts.
  const latest = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const requestId = ++latest.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchSchoolPeople(trimmed);
        if (requestId !== latest.current) return;
        setResults(found);
        setError(null);
      } catch {
        if (requestId !== latest.current) return;
        setError("Couldn't search members just now.");
      } finally {
        if (requestId === latest.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // Whatever was typed into the search is a head start on the new-person form.
  const startNew = () =>
    onStartNew(
      trimmed.includes("@") ? { email: trimmed } : trimmed ? { name: trimmed } : undefined
    );

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-search`}>Who are you adding?</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${idPrefix}-search`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members by name or email"
          className="pl-9"
          autoComplete="off"
          disabled={disabled}
          // Enter in a search box must not submit the dialog's form.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (results.length === 1) onSelect(results[0]);
            }
          }}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {trimmed.length >= 2 && !loading && (
        <div className="overflow-hidden rounded-lg border border-border">
          {error ? (
            <p className="p-3 text-sm text-red-600">{error}</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No one at the school matches &ldquo;{trimmed}&rdquo;.
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto">
              {results.map((p) => (
                <li key={p.email}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    disabled={disabled}
                    className="w-full p-3 text-left hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                  >
                    <PersonSummary person={p} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={startNew}
        disabled={disabled}
        className="flex items-center gap-1.5 text-sm font-medium text-dragon-blue-600 hover:underline"
      >
        <UserPlus className="h-4 w-4" />
        Not in DragonHub yet? Add someone new
      </button>
    </div>
  );
}

function PersonSummary({ person }: { person: PersonOption }) {
  const label = person.name || person.email;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dragon-blue-500 text-xs font-bold text-white">
        {person.name ? getInitials(person.name) : person.email[0].toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{label}</span>
          {person.pending && (
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              Not verified
            </Badge>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {person.email}
          {person.phone && ` · ${formatPhoneNumber(person.phone)}`}
        </p>
      </div>
    </div>
  );
}
