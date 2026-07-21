import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy h:mm a");
}

export function formatRelativeDate(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  // Format as (XXX) XXX-XXXX for 10 digits, or +X (XXX) XXX-XXXX for 11 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Return original if not a standard US number
  return phone;
}

/**
 * Format a US phone number while the user types, e.g. "5551234567" -> "(555) 123-4567".
 * Input that isn't a US-style number is left untouched so validation can flag it.
 */
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length > 11 || (digits.length === 11 && digits[0] !== "1")) {
    return value;
  }

  const hasCountryCode = digits.length === 11;
  const prefix = hasCountryCode ? "+1 " : "";
  const local = hasCountryCode ? digits.slice(1) : digits;

  if (local.length < 4) return `${prefix}${local}`;
  if (local.length < 7) return `${prefix}(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `${prefix}(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

// Deliberately permissive: one "@", no whitespace, and a dotted domain with a
// real TLD. Catches typos like "jane@gmail" or "jane @example.com" without
// rejecting valid-but-unusual addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_PATTERN.test(email.trim());
}

export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return true; // Empty is allowed (optional field)
  const digits = phone.replace(/\D/g, "");
  // Accept 10 digits or 11 digits starting with 1
  return digits.length === 10 || (digits.length === 11 && digits[0] === "1");
}

export function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Store as just digits
  return digits;
}
