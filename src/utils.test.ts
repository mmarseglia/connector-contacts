import { describe, it, expect } from "vitest";
import { toolResult, toolError, sanitizeErrorMessage } from "./utils.js";

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

  it("strips absolute paths from error messages", () => {
    const result = toolError(
      new Error("ENOENT: no such file or directory: /Users/john/Library/Contacts/foo"),
    );

    expect(result.content[0].text).not.toContain("/Users/john");
    expect(result.content[0].text).toContain("<path>");
    expect(result.isError).toBe(true);
  });
});

describe("sanitizeErrorMessage", () => {
  it("replaces absolute paths with <path>", () => {
    expect(
      sanitizeErrorMessage("failed at /Users/john/Library/Contacts/db"),
    ).toBe("failed at <path>");
  });

  it("replaces multiple paths in one message", () => {
    expect(
      sanitizeErrorMessage("cp /src/a to /dst/b failed"),
    ).toBe("cp <path> to <path> failed");
  });

  it("leaves messages without paths unchanged", () => {
    expect(sanitizeErrorMessage("Contact not found")).toBe(
      "Contact not found",
    );
  });

  it("leaves single-segment slash-prefixed words unchanged", () => {
    expect(sanitizeErrorMessage("error in /tmp")).toBe("error in /tmp");
  });
});
