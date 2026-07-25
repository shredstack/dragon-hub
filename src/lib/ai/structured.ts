import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, DEFAULT_MODEL } from "./client";

/**
 * Thrown when the model cannot produce usable structured output — the response
 * was truncated at the token ceiling, came back with no text, or (despite the
 * schema constraint) wasn't valid JSON. Callers can surface this message or
 * fall back, instead of getting a bare `SyntaxError` from `JSON.parse`.
 */
export class AiStructuredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AiStructuredError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export interface StructuredJsonOptions {
  /** JSON schema (draft 2020-12) describing the object you want back. */
  schema: Record<string, unknown>;
  /** Convenience for a single text user turn. Ignored when `content` is set. */
  prompt?: string;
  /** Full user-message content blocks — use this for images or PDFs. */
  content?: Anthropic.ContentBlockParam[];
  system?: string;
  model?: string;
  /** Starting token budget. Retried once at 2x if the first attempt truncates. */
  maxTokens?: number;
  /**
   * Defaults to disabled (all we need for extraction/formatting). Pass an
   * adaptive/enabled config for heavy multi-source synthesis.
   */
  thinking?: Anthropic.ThinkingConfigParam;
  effort?: Anthropic.OutputConfig["effort"];
}

/**
 * The one place we ask the model for JSON. It uses the API's native structured
 * outputs (`output_config.format`), which constrains generation to `schema`, so
 * the returned text is guaranteed valid JSON — no markdown-fence stripping, no
 * "return ONLY JSON" pleading, no per-caller regex.
 *
 * The only remaining failure mode is truncation at `max_tokens` (which leaves
 * the JSON incomplete). We detect that via `stop_reason` and retry once with
 * double the budget before failing with a clear {@link AiStructuredError}.
 *
 * Every AI action that wants an object back should route through here so the
 * parsing/truncation/error behaviour stays identical across the app.
 */
export async function generateStructuredJson<T>(
  opts: StructuredJsonOptions
): Promise<T> {
  const {
    schema,
    prompt,
    content,
    system,
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    thinking = { type: "disabled" },
    effort,
  } = opts;

  const userContent = content ?? prompt;
  if (userContent === undefined) {
    throw new AiStructuredError(
      "generateStructuredJson requires either `prompt` or `content`."
    );
  }

  let truncationError: AiStructuredError | null = null;

  for (const tokens of [maxTokens, maxTokens * 2]) {
    const message = await anthropic.messages.create({
      model,
      max_tokens: tokens,
      thinking,
      ...(system ? { system } : {}),
      output_config: {
        ...(effort ? { effort } : {}),
        format: { type: "json_schema", schema },
      },
      messages: [{ role: "user", content: userContent }],
    });

    if (message.stop_reason === "max_tokens") {
      // Incomplete JSON — retry with more headroom before giving up.
      truncationError = new AiStructuredError(
        `AI response was truncated at ${tokens} tokens.`
      );
      continue;
    }

    // With thinking enabled the text block isn't necessarily content[0].
    const textBlock = message.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    if (!textBlock) {
      throw new AiStructuredError("AI returned no text content.");
    }

    try {
      return JSON.parse(textBlock.text) as T;
    } catch (err) {
      throw new AiStructuredError("AI returned unparseable JSON.", {
        cause: err,
      });
    }
  }

  throw (
    truncationError ??
    new AiStructuredError("AI request failed to produce structured output.")
  );
}
