"use client";

import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneInput, isValidEmail, isValidPhoneNumber } from "@/lib/utils";

/**
 * Name / email / phone, shared by every public volunteer signup form and by
 * the board's "add someone by hand" dialogs (`variant="board"`, via
 * `PersonPicker`).
 *
 * Errors surface on blur (and on submit) rather than on every keystroke, so a
 * field doesn't turn red while a valid address is still being typed.
 */

export interface ContactValue {
  name: string;
  email: string;
  phone: string;
}

const EMPTY_CONTACT: ContactValue = { name: "", email: "", phone: "" };

export interface ContactFieldsState {
  value: ContactValue;
  /** Runs every rule and paints all bad fields at once. Call before submitting. */
  validate: () => boolean;
  /** True when the required fields are filled and nothing is currently flagged. */
  isComplete: boolean;
  /** Replace every field (blank by default) and clear the flags — for a dialog reopening. */
  reset: (next?: Partial<ContactValue>) => void;
  fieldProps: ContactFieldsProps;
}

/**
 * Owns the contact state and its validation so forms only have to gate their
 * submit button on `isComplete` and call `validate()` on submit.
 */
export function useContactFields(): ContactFieldsState {
  const [value, setValue] = useState<ContactValue>(EMPTY_CONTACT);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const validateEmail = (email = value.email) => {
    const invalid = !!email.trim() && !isValidEmail(email);
    setEmailError(
      invalid ? "Enter a valid email address, e.g. jane@example.com" : null
    );
    return !invalid;
  };

  const validatePhone = (phone = value.phone) => {
    const invalid = !!phone.trim() && !isValidPhoneNumber(phone);
    setPhoneError(
      invalid ? "Enter a 10-digit phone number, e.g. (555) 123-4567" : null
    );
    return !invalid;
  };

  // Stable, so a dialog can call it from an effect keyed on `open`.
  const reset = useCallback((next?: Partial<ContactValue>) => {
    setValue({ ...EMPTY_CONTACT, ...next });
    setEmailError(null);
    setPhoneError(null);
  }, []);

  const validate = () => {
    // Run both so every problem field is flagged at once.
    const emailOk = validateEmail();
    const phoneOk = validatePhone();
    return emailOk && phoneOk;
  };

  return {
    value,
    validate,
    isComplete:
      !!value.name.trim() && !!value.email.trim() && !emailError && !phoneError,
    reset,
    fieldProps: {
      value,
      emailError,
      phoneError,
      onChange: (next) => setValue((prev) => ({ ...prev, ...next })),
      onClearEmailError: () => setEmailError(null),
      onClearPhoneError: () => setPhoneError(null),
      onValidateEmail: () => validateEmail(),
      onValidatePhone: () => validatePhone(),
    },
  };
}

export interface ContactFieldsProps {
  value: ContactValue;
  emailError: string | null;
  phoneError: string | null;
  onChange: (next: Partial<ContactValue>) => void;
  onClearEmailError: () => void;
  onClearPhoneError: () => void;
  onValidateEmail: () => void;
  onValidatePhone: () => void;
}

interface ContactFieldsDisplayProps {
  /**
   * `self` is a parent filling in their own details on a public form. `board`
   * is a board member typing someone else's in off a paper sheet — same rules,
   * but "your name" and "we'll email you" would be addressed to the wrong
   * person.
   */
  variant?: "self" | "board";
  /** Prefix for the input ids, so two of these can share a page. */
  idPrefix?: string;
  disabled?: boolean;
}

export function ContactFields({
  value,
  emailError,
  phoneError,
  onChange,
  onClearEmailError,
  onClearPhoneError,
  onValidateEmail,
  onValidatePhone,
  variant = "self",
  idPrefix = "",
  disabled,
}: ContactFieldsProps & ContactFieldsDisplayProps) {
  const isBoard = variant === "board";
  const id = (field: string) => (idPrefix ? `${idPrefix}-${field}` : field);
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={id("name")}>
          {isBoard ? "Full name *" : "Your name (parent or guardian) *"}
        </Label>
        <Input
          id={id("name")}
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Jane Smith"
          required
          disabled={disabled}
          aria-describedby={isBoard ? undefined : id("name-help")}
        />
        {/*
          The classroom picker further down asks parents to choose the room "for
          your child(ren)", which primes exactly the wrong answer here: the
          account being created is the grown-up's, and this name is what other
          volunteers and the teacher will see on the roster.

          There *is* now a place for a child's name — the optional students
          field — so this points at it rather than saying it doesn't exist. Every
          form using `ContactFields` renders that field directly below.
        */}
        {!isBoard && (
          <p id={id("name-help")} className="mt-1 text-xs text-muted-foreground">
            Please use your own name, not your child&apos;s — there&apos;s a
            separate spot below for your student(s).
          </p>
        )}
      </div>
      <div>
        <Label htmlFor={id("email")}>{isBoard ? "Email *" : "Email Address *"}</Label>
        <Input
          id={id("email")}
          type="email"
          inputMode="email"
          autoComplete={isBoard ? "off" : "email"}
          value={value.email}
          onChange={(e) => {
            onChange({ email: e.target.value });
            if (emailError) onClearEmailError();
          }}
          onBlur={onValidateEmail}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? id("email-error") : undefined}
          className={
            emailError ? "border-red-500 focus-visible:ring-red-500" : undefined
          }
          placeholder="jane@example.com"
          required
          disabled={disabled}
        />
        {emailError ? (
          <p id={id("email-error")} className="mt-1 text-sm text-red-600">
            {emailError}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {isBoard
              ? "They'll get access as soon as they sign in with this address."
              : "We'll email your sign-in link here, so double-check it."}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor={id("phone")}>{isBoard ? "Phone" : "Phone Number"}</Label>
        <Input
          id={id("phone")}
          type="tel"
          inputMode="tel"
          autoComplete={isBoard ? "off" : "tel"}
          value={value.phone}
          onChange={(e) => {
            onChange({ phone: formatPhoneInput(e.target.value) });
            if (phoneError) onClearPhoneError();
          }}
          onBlur={onValidatePhone}
          aria-invalid={!!phoneError}
          aria-describedby={phoneError ? id("phone-error") : undefined}
          className={
            phoneError ? "border-red-500 focus-visible:ring-red-500" : undefined
          }
          placeholder="(555) 123-4567"
          disabled={disabled}
        />
        {phoneError && (
          <p id={id("phone-error")} className="mt-1 text-sm text-red-600">
            {phoneError}
          </p>
        )}
      </div>
    </div>
  );
}
