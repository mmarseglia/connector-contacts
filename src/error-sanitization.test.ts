import { vi, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Mock child_process before any imports that depend on it.
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { listGroups, createGroup, exportContactVCard } from "./contacts-applescript.js";
import { toolError } from "./utils.js";

const mockExecFileSync = vi.mocked(execFileSync);

// ---------------------------------------------------------------------------
// Error sanitization — system scripting errors have absolute file-system
// paths stripped before being returned to MCP clients.
//
// The sanitizeErrorMessage() helper in utils.ts replaces multi-segment
// absolute paths (e.g. /Users/jane/Library/…) with the placeholder <path>.
// This is applied in both runAppleScript() and toolError() for defence
// in depth.
// ---------------------------------------------------------------------------

describe("error sanitization — system paths are stripped before reaching client", () => {
  // -----------------------------------------------------------------------
  // 1. AppleScript stderr containing system paths is sanitised
  // -----------------------------------------------------------------------
  describe("AppleScript errors with system paths", () => {
    it("strips /Users paths from osascript stderr before reaching the client", () => {
      const stderrWithPath =
        "/Users/jane/Library/Application Scripts/com.apple.Contacts: execution error: (-1708)";
      const err = Object.assign(new Error("command failed"), {
        stderr: stderrWithPath,
      });
      mockExecFileSync.mockImplementation(() => {
        throw err;
      });

      // The thrown error should NOT contain the original path
      expect(() => listGroups()).toThrow("<path>");

      // Wrapping through toolError also strips the path
      try {
        listGroups();
      } catch (e) {
        const result = toolError(e);
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.error).not.toContain("/Users/jane/Library");
        expect(parsed.error).toContain("<path>");
        expect(result.isError).toBe(true);
      }
    });

    it("strips /var/folders temp paths from osascript stderr", () => {
      const stderrWithTempPath =
        "/var/folders/xx/abc123/T/osascript.12345: syntax error (-2741)";
      const err = Object.assign(new Error("command failed"), {
        stderr: stderrWithTempPath,
      });
      mockExecFileSync.mockImplementation(() => {
        throw err;
      });

      try {
        createGroup("Test");
      } catch (e) {
        const result = toolError(e);
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.error).not.toContain("/var/folders/");
        expect(parsed.error).toContain("<path>");
      }
    });

    it("strips /usr/local paths from osascript stderr", () => {
      const stderrWithUsrPath =
        "/usr/local/bin/osascript: can't open script file: /tmp/bad-script.scpt";
      const err = Object.assign(new Error("command failed"), {
        stderr: stderrWithUsrPath,
      });
      mockExecFileSync.mockImplementation(() => {
        throw err;
      });

      try {
        exportContactVCard("Someone");
      } catch (e) {
        const result = toolError(e);
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.error).not.toContain("/usr/local/bin/osascript");
        expect(parsed.error).toContain("<path>");
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. toolError() sanitises all multi-segment path patterns
  // -----------------------------------------------------------------------
  describe("toolError strips multi-segment path patterns", () => {
    const pathPatterns = [
      { label: "home directory", path: "/Users/mike/.config/contacts/db.sqlite" },
      { label: "system library", path: "/System/Library/Frameworks/Contacts.framework/Resources" },
      { label: "node_modules", path: "/opt/homebrew/lib/node_modules/node-mac-contacts/build/Release/contacts.node" },
      { label: "tmp directory", path: "/private/var/folders/zz/abc123/T/com.apple.Contacts" },
    ];

    for (const { label, path } of pathPatterns) {
      it(`strips ${label} paths: ${path}`, () => {
        const error = new Error(`Operation failed: ${path}: permission denied`);
        const result = toolError(error);
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.error).not.toContain(path);
        expect(parsed.error).toContain("<path>");
      });
    }

    it("does not alter Windows-style paths (not applicable on macOS)", () => {
      const error = new Error("Operation failed: C:\\Users\\mike\\AppData\\Local\\Contacts: error");
      const result = toolError(error);
      const parsed = JSON.parse(result.content[0].text);

      // Windows paths don't start with / so they're not matched
      expect(parsed.error).toContain("C:\\Users\\mike");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Native module load failure paths are sanitised
  // -----------------------------------------------------------------------
  describe("native module load errors", () => {
    it("strips file paths from native module error messages", () => {
      const nativeError = new Error(
        "Cannot find module '/usr/local/lib/node_modules/node-mac-contacts/build/Release/contacts.node'"
      );

      const result = toolError(nativeError);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error).not.toContain("/usr/local/lib/node_modules");
      expect(parsed.error).toContain("<path>");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Usernames embedded in paths are redacted along with the path
  // -----------------------------------------------------------------------
  describe("toolError redacts sensitive patterns in paths", () => {
    it("redacts username embedded in path", () => {
      const result = toolError(new Error("EACCES: /Users/jane.doe/.contacts/store.db"));
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error).not.toContain("jane.doe");
      expect(parsed.error).toContain("<path>");
    });

    it("preserves hostname/IP if present in error message (not a path)", () => {
      const result = toolError(
        new Error("ECONNREFUSED 192.168.1.42:5432 - connection to contacts DB failed")
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error).toContain("192.168.1.42");
    });
  });
});
