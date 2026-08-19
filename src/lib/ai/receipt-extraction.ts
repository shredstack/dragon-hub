import type Anthropic from "@anthropic-ai/sdk";
import { generateStructuredJson } from "./structured";

/**
 * Reading a receipt so the submitter doesn't have to type it.
 *
 * The same two-pass philosophy as the whiteboard capture, and for the same
 * reason: **the AI drafts, the human confirms, nothing propagates unreviewed.**
 * Everything this returns lands in an editable field with the uncertain ones
 * marked, and none of it is saved until the person who was actually standing at
 * the till presses Continue. Extraction is an accelerant, never a dependency —
 * when it fails the wizard opens on a blank form and works exactly as it did
 * before this file existed.
 *
 * That is why the prompt is written as *transcription* rather than
 * interpretation. A total the model computed rather than read is worse than no
 * total at all: it looks like evidence, and an officer comparing the claim
 * against the receipt image is the legal control this whole feature rests on.
 */

const VISION_MODEL = "claude-opus-4-8";

export interface ExtractedReceipt {
  vendor: string | null;
  /** `YYYY-MM-DD`. */
  purchaseDate: string | null;
  items: { description: string; quantity: number; amount: string }[];
  subtotal: string | null;
  salesTax: string | null;
  total: string | null;
  /**
   * e.g. "VISA ****1234", "EBT". Surfaced to officers beside the receipt
   * image, because a PTA cannot legally reimburse a purchase made with
   * government-assistance funds. The tool never auto-rejects on it — the
   * officers' review is the control, this only makes it possible to perform.
   */
  paymentMethodHint: string | null;
  /** Field names the model was not confident about, e.g. ["total", "salesTax"]. */
  uncertain: string[];
}

/** The field names `uncertain` may name, so the form can mark them. */
export const EXTRACTABLE_FIELDS = [
  "vendor",
  "purchaseDate",
  "subtotal",
  "salesTax",
  "total",
  "items",
  "paymentMethodHint",
] as const;

export type ExtractableField = (typeof EXTRACTABLE_FIELDS)[number];

const SYSTEM_PROMPT = `You transcribe receipts for a PTA's reimbursement records. You are reading a document that will be audited, so your job is transcription, not interpretation.

Rules, in order of importance:
1. Report ONLY what is printed on the receipt. Never compute, infer, or reconcile a figure.
2. If a value is not printed, or you cannot read it, return null for it. A null is a correct answer; a plausible guess is not.
3. NEVER derive a sales tax amount. If the receipt does not print a tax line, salesTax is null — not "0", and not total minus subtotal.
4. If the printed subtotal, tax and total do not add up, transcribe all three as printed anyway. The discrepancy is information a human needs, not an error for you to fix.
5. Amounts are plain decimal strings with no currency symbol or thousands separators: "12.40", "1204.00".
6. purchaseDate is the transaction date printed on the receipt, as YYYY-MM-DD. If only a partial date is printed, return null.
7. paymentMethodHint is whatever the receipt says about how it was paid — a card brand and last four digits, "CASH", "EBT", "SNAP", "DEBIT". Copy it as printed. Return null when nothing is printed.
8. List every line item you can read, with its quantity and its pre-tax amount. Omit subtotal, tax, total, discount and change lines from items.
9. List in "uncertain" the name of every field whose value you are not confident you read correctly — including fields you returned a value for. Use only these names: vendor, purchaseDate, subtotal, salesTax, total, items, paymentMethodHint.`;

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    vendor: {
      type: ["string", "null"],
      description: "The store or supplier name as printed.",
    },
    purchaseDate: {
      type: ["string", "null"],
      description: "Transaction date as YYYY-MM-DD, or null.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "integer" },
          amount: { type: "string", description: "Pre-tax amount, e.g. 12.40" },
        },
        required: ["description", "quantity", "amount"],
        additionalProperties: false,
      },
    },
    subtotal: { type: ["string", "null"] },
    salesTax: { type: ["string", "null"] },
    total: { type: ["string", "null"] },
    paymentMethodHint: { type: ["string", "null"] },
    uncertain: {
      type: "array",
      items: {
        type: "string",
        enum: [...EXTRACTABLE_FIELDS],
      },
    },
  },
  required: [
    "vendor",
    "purchaseDate",
    "items",
    "subtotal",
    "salesTax",
    "total",
    "paymentMethodHint",
    "uncertain",
  ],
  additionalProperties: false,
};

/**
 * Read one receipt image or PDF.
 *
 * Throws `AiStructuredError` when the model cannot produce usable output —
 * deliberately not swallowed, because the caller's fallback (open the form
 * blank) is better than a shape full of nulls that looks like a successful
 * read of an empty receipt.
 */
export async function extractReceipt(params: {
  /** The public blob URL of the uploaded receipt. */
  url: string;
  contentType: string;
}): Promise<ExtractedReceipt> {
  const source: Anthropic.ContentBlockParam =
    params.contentType === "application/pdf"
      ? { type: "document", source: { type: "url", url: params.url } }
      : { type: "image", source: { type: "url", url: params.url } };

  const parsed = await generateStructuredJson<Partial<ExtractedReceipt>>({
    model: VISION_MODEL,
    maxTokens: 4096,
    system: SYSTEM_PROMPT,
    content: [
      source,
      {
        type: "text",
        text: "Transcribe this receipt. Return null for anything not printed or not legible, and name every field you are unsure about in `uncertain`.",
      },
    ],
    schema: SCHEMA,
  });

  return {
    vendor: cleanString(parsed.vendor),
    purchaseDate: cleanDate(parsed.purchaseDate),
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item?.description?.trim())
          .map((item) => ({
            description: item.description.trim(),
            quantity:
              Number.isFinite(item.quantity) && item.quantity > 0
                ? Math.floor(item.quantity)
                : 1,
            amount: cleanAmount(item.amount) ?? "0.00",
          }))
      : [],
    subtotal: cleanAmount(parsed.subtotal),
    salesTax: cleanAmount(parsed.salesTax),
    total: cleanAmount(parsed.total),
    paymentMethodHint: cleanString(parsed.paymentMethodHint),
    uncertain: Array.isArray(parsed.uncertain)
      ? parsed.uncertain.filter((field): field is string =>
          (EXTRACTABLE_FIELDS as readonly string[]).includes(field)
        )
      : [],
  };
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A date the model only *nearly* got right is worse than none: it prefills a
 * field the submitter is likely to skim past, and the expense-age flag is
 * computed from it. So only two shapes are accepted — the ISO one the prompt
 * asks for, and the `M/D/YYYY` a US till prints, which the model sometimes
 * copies verbatim rather than reformatting.
 *
 * Month-first is the right reading here and not a guess: every school on this
 * platform is a US school, resolved through the NCES district reference table.
 * Anything else — a two-digit year, a written month, a partial date — is
 * dropped rather than interpreted.
 */
function cleanDate(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!us) return null;
  const [, month, day, year] = us;
  if (Number(month) < 1 || Number(month) > 12) return null;
  if (Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Strips a currency symbol the model slipped in; refuses anything else. */
function cleanAmount(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const stripped = text.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(stripped)) return null;
  return Number.parseFloat(stripped).toFixed(2);
}
