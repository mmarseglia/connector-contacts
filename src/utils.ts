/**
 * Wrap a successful tool result as MCP text content.
 */
export function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Wrap an error as MCP text content with isError flag.
 */
export function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    isError: true,
  };
}
