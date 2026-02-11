import Anthropic from "@anthropic-ai/sdk";

// Shared Anthropic client instance
export const anthropic = new Anthropic();

// Default model for AI operations
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
