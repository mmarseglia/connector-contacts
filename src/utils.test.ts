import { describe, it, expect } from "vitest";
import { toolResult, toolError } from "./utils.js";

describe("toolResult", () => {
  it("wraps data in MCP text content with pretty-printed JSON", () => {
    const data = { count: 2, items: ["a", "b"] };
    const result = toolResult(data);

    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    });
  });

  it("handles primitive data values", () => {
    const result = toolResult("simple string");

    expect(result.content[0].text).toBe('"simple string"');
  });

  it("does not set isError property", () => {
    const result = toolResult({ ok: true });

    expect(result).not.toHaveProperty("isError");
  });
});

describe("toolError", () => {
  it("extracts message from Error instances", () => {
    const result = toolError(new Error("something went wrong"));

    expect(result).toEqual({
      content: [
        { type: "text", text: '{"error":"something went wrong"}' },
      ],
      isError: true,
    });
  });

  it("converts non-Error values to string", () => {
    const result = toolError(42);

    expect(result.content[0].text).toBe('{"error":"42"}');
    expect(result.isError).toBe(true);
  });
});
