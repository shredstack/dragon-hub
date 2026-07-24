"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneInput, isValidEmail, isValidPhoneNumber } from "@/lib/utils";

/**
 * Name / email / phone, shared by every public volunteer signup form.
 *
 * Errors surface on blur (and on submit) rather than on every keystroke, so a
 * field doesn't turn red while a valid address is still being typed.
 */

export interface ContactValue {
  name: string;
  email: string;
  phone: string;
}

export interface ContactFieldsState {
  value: ContactValue;
  /** Runs every rule and paints all bad fields at once. Call before submitting. */
  validate: () => boolean;
  /** True when the required fields are filled and nothing is currently flagged. */
  isComplete: boolean;
  fieldProps: ContactFieldsProps;
}

/**
 * Owns the contact state and its validation so forms only have to gate their
 * submit button on `isComplete` and call `validate()` on submit.
 */
export function useContactFields(): ContactFieldsState {
  const [value, setValue] = useState<ContactValue>({
    name: "",
    email: "",
    phone: "",
  });
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

export function ContactFields({
  value,
  emailError,
  phoneError,
  onChange,
  onClearEmailError,
  onClearPhoneError,
  onValidateEmail,
  onValidatePhone,
}: ContactFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">Your name (parent or guardian) *</Label>
        <Input
          id="name"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Jane Smith"
          required
          aria-describedby="name-help"
        />
        {/*
          The classroom picker directly below this asks parents to choose the
          room "for your child(ren)", which primes exactly the wrong answer
          here. DragonHub deliberately holds no student names — the account
          being created is the grown-up's, and this name is what other
          volunteers and the teacher will see on the roster.
        */}
        <p id="name-help" className="mt-1 text-xs text-muted-foreground">
          Please use your own name, not your child&apos;s — we don&apos;t collect
          student names.
        </p>
      </div>
      <div>
        <Label htmlFor="email">Email Address *</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value.email}
          onChange={(e) => {
            onChange({ email: e.target.value });
            if (emailError) onClearEmailError();
          }}
          onBlur={onValidateEmail}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? "email-error" : undefined}
          className={
            emailError ? "border-red-500 focus-visible:ring-red-500" : undefined
          }
          placeholder="jane@example.com"
          required
        />
        {emailError ? (
          <p id="email-error" className="mt-1 text-sm text-red-600">
            {emailError}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            We&apos;ll email your sign-in link here, so double-check it.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value.phone}
          onChange={(e) => {
            onChange({ phone: formatPhoneInput(e.target.value) });
            if (phoneError) onClearPhoneError();
          }}
          onBlur={onValidatePhone}
          aria-invalid={!!phoneError}
          aria-describedby={phoneError ? "phone-error" : undefined}
          className={
            phoneError ? "border-red-500 focus-visible:ring-red-500" : undefined
          }
          placeholder="(555) 123-4567"
        />
        {phoneError && (
          <p id="phone-error" className="mt-1 text-sm text-red-600">
            {phoneError}
          </p>
        )}
      </div>
    </div>
  );
}
