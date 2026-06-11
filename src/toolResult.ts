import { describeError } from "./errors.js";

export interface ToolErrorResult {
  [key: string]: unknown;
  isError: true;
  content: Array<{ type: "text"; text: string }>;
}

export function toolError(message: string): ToolErrorResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export function toolErrorFrom(err: unknown): ToolErrorResult {
  return toolError(describeError(err));
}
