/**
 * Wrap a successful tool result as MCP text content.
 */
export function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Strip absolute file-system paths from error messages to avoid
 * leaking system directory structure to MCP clients.
 */
export function sanitizeErrorMessage(msg: string): string {
  return msg.replace(/(?:\/[\w.@-]+){2,}/g, "<path>");
}

/**
 * Wrap an error as MCP text content with isError flag.
 */
export function toolError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const message = sanitizeErrorMessage(raw);
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    isError: true,
  };
}
