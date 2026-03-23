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
// Error sanitization — system scripting errors are passed through to the
// client without sanitization.  These tests document the current behaviour
// and flag where system paths leak through error messages.
//
// Security concern:  AppleScript (osascript) stderr and native-module
// load failures can embed absolute file-system paths such as
//   /Users/jane/Library/…  or  /usr/local/lib/node_modules/…
// These are forwarded verbatim to MCP clients via toolError().
// ---------------------------------------------------------------------------

describe("error sanitization — system paths leak through to client", () => {
  // -----------------------------------------------------------------------
  // 1. AppleScript stderr containing system paths is exposed verbatim
  // -----------------------------------------------------------------------
  describe("AppleScript errors with system paths", () => {
    it("passes osascript stderr containing /Users paths through to the client", () => {
      const stderrWithPath =
        "/Users/jane/Library/Application Scripts/com.apple.Contacts: execution error: (-1708)";
      const err = Object.assign(new Error("command failed"), {
        stderr: stderrWithPath,
      });
      mockExecFileSync.mockImplementation(() => {
        throw err;
      });

      // The error propagates with the full system path intact
      expect(() => listGroups()).toThrow(stderrWithPath);

      // Wrapping through toolError also preserves the path
      try {
        listGroups();
      } catch (e) {
        const result = toolError(e);
        const parsed = JSON.parse(result.content[0].text);

        // Current behaviour: system path is present in the client-facing error
        expect(parsed.error).toContain("/Users/jane/Library");
        expect(result.isError).toBe(true);
      }
    });

    it("passes osascript stderr containing /var/folders temp paths through to the client", () => {
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

        expect(parsed.error).toContain("/var/folders/");
        expect(parsed.error).toContain("osascript");
      }
    });

    it("passes osascript stderr containing /usr/local paths through to the client", () => {
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

        expect(parsed.error).toContain("/usr/local/bin/osascript");
        expect(parsed.error).toContain("/tmp/bad-script.scpt");
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. toolError() performs no sanitization on any error string
  // -----------------------------------------------------------------------
  describe("toolError passes through all path patterns unsanitised", () => {
    const pathPatterns = [
      { label: "home directory", path: "/Users/mike/.config/contacts/db.sqlite" },
      { label: "system library", path: "/System/Library/Frameworks/Contacts.framework/Resources" },
      { label: "node_modules", path: "/opt/homebrew/lib/node_modules/node-mac-contacts/build/Release/contacts.node" },
      { label: "tmp directory", path: "/private/var/folders/zz/abc123/T/com.apple.Contacts" },
      { label: "Windows-style path (WSL)", path: "C:\\Users\\mike\\AppData\\Local\\Contacts" },
    ];

    for (const { label, path } of pathPatterns) {
      it(`does not filter ${label} paths: ${path}`, () => {
        const error = new Error(`Operation failed: ${path}: permission denied`);
        const result = toolError(error);
        const parsed = JSON.parse(result.content[0].text);

        // The path appears in the client-facing error message verbatim
        expect(parsed.error).toContain(path);
      });
    }
  });

  // -----------------------------------------------------------------------
  // 3. Native module load failure can expose file-system layout
  // -----------------------------------------------------------------------
  describe("native module load errors", () => {
    it("toolError preserves full stack trace with file paths when given an Error", () => {
      const nativeError = new Error(
        "Cannot find module '/usr/local/lib/node_modules/node-mac-contacts/build/Release/contacts.node'"
      );
      // Real Node errors include a stack with absolute paths
      nativeError.stack =
        `Error: Cannot find module '/usr/local/lib/node_modules/node-mac-contacts/build/Release/contacts.node'\n` +
        `    at Module._resolveFilename (/usr/local/lib/node_modules/node/lib/internal/modules/cjs/loader.js:636:15)`;

      const result = toolError(nativeError);
      const parsed = JSON.parse(result.content[0].text);

      // toolError uses error.message (not stack), but the message itself contains the path
      expect(parsed.error).toContain("/usr/local/lib/node_modules/node-mac-contacts");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Demonstrate that error.message is used as-is (no redaction)
  // -----------------------------------------------------------------------
  describe("toolError does not redact sensitive patterns", () => {
    it("preserves username from path in error message", () => {
      const result = toolError(new Error("EACCES: /Users/jane.doe/.contacts/store.db"));
      const parsed = JSON.parse(result.content[0].text);

      // A username ("jane.doe") is embedded in the path and reaches the client
      expect(parsed.error).toContain("jane.doe");
    });

    it("preserves hostname/IP if present in error message", () => {
      const result = toolError(
        new Error("ECONNREFUSED 192.168.1.42:5432 - connection to contacts DB failed")
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error).toContain("192.168.1.42");
    });
  });
});
