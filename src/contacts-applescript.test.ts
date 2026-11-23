import { vi, describe, it, expect } from "vitest";

// Mock child_process before any imports that depend on it.
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import {
  listGroups,
  createGroup,
  deleteGroup,
  getGroupMembers,
  addContactToGroup,
  removeContactFromGroup,
  exportContactVCard,
  updateContact,
} from "./contacts-applescript.js";

const mockExecFileSync = vi.mocked(execFileSync);

/** Assert that osascript was called with a script containing the given substring. */
function expectScriptContaining(substring: string) {
  expect(mockExecFileSync).toHaveBeenCalledWith(
    "osascript",
    ["-e", expect.stringContaining(substring)],
    expect.objectContaining({ encoding: "utf-8", timeout: 15_000 }),
  );
}

// ---------------------------------------------------------------------------
// listGroups
// ---------------------------------------------------------------------------

describe("listGroups", () => {
  it("parses comma-separated group names from AppleScript output", () => {
    mockExecFileSync.mockReturnValue("Family, Friends, Work\n");

    expect(listGroups()).toEqual(["Family", "Friends", "Work"]);
  });

  it("returns empty array when AppleScript returns empty string", () => {
    mockExecFileSync.mockReturnValue("\n");

    expect(listGroups()).toEqual([]);
  });

  it("returns single-element array for one group", () => {
    mockExecFileSync.mockReturnValue("Solo\n");

    expect(listGroups()).toEqual(["Solo"]);
  });
});

// ---------------------------------------------------------------------------
// createGroup
// ---------------------------------------------------------------------------

describe("createGroup", () => {
  it("returns created message when group is new", () => {
    mockExecFileSync.mockReturnValue("created");

    expect(createGroup("Work")).toEqual({
      success: true,
      message: 'Group "Work" created',
    });
  });

  it("returns already exists message when group exists", () => {
    mockExecFileSync.mockReturnValue("exists");

    expect(createGroup("Work")).toEqual({
      success: true,
      message: 'Group "Work" already exists',
    });
  });

  it("escapes double quotes and backslashes in group name", () => {
    mockExecFileSync.mockReturnValue("created");

    createGroup('Test "Group\\ Name');

    // The escaped version should have \" and \\ in the AppleScript string
    expectScriptContaining('Test \\"Group\\\\ Name');
  });
});

// ---------------------------------------------------------------------------
// deleteGroup
// ---------------------------------------------------------------------------

describe("deleteGroup", () => {
  it("returns success when group is deleted", () => {
    mockExecFileSync.mockReturnValue("deleted");

    expect(deleteGroup("Old")).toEqual({
      success: true,
      message: 'Group "Old" deleted',
    });
  });

  it("returns failure when group not found", () => {
    mockExecFileSync.mockReturnValue("not_found");

    expect(deleteGroup("Ghost")).toEqual({
      success: false,
      message: 'Group "Ghost" not found',
    });
  });
});

// ---------------------------------------------------------------------------
// getGroupMembers
// ---------------------------------------------------------------------------

describe("getGroupMembers", () => {
  it("parses comma-separated member names", () => {
    mockExecFileSync.mockReturnValue("Alice Smith, Bob Jones\n");

    expect(getGroupMembers("Work")).toEqual(["Alice Smith", "Bob Jones"]);
  });

  it("returns empty array when group has no members", () => {
    mockExecFileSync.mockReturnValue("\n");

    expect(getGroupMembers("Empty")).toEqual([]);
  });

  it("throws Error when group is not found", () => {
    mockExecFileSync.mockReturnValue("GROUP_NOT_FOUND");

    expect(() => getGroupMembers("Ghost")).toThrow('Group "Ghost" not found');
  });
});

// ---------------------------------------------------------------------------
// addContactToGroup
// ---------------------------------------------------------------------------

describe("addContactToGroup", () => {
  it("returns success message with contact and group names", () => {
    mockExecFileSync.mockReturnValue("added");

    expect(addContactToGroup("Alice Smith", "Work")).toEqual({
      success: true,
      message: 'Added "Alice Smith" to group "Work"',
    });
  });

  it("propagates AppleScript errors as a wrapped Error", () => {
    const err = Object.assign(new Error("command failed"), {
      stderr: "execution error: Contacts got an error",
    });
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });

    expect(() => addContactToGroup("X", "Y")).toThrow(
      "AppleScript error: execution error: Contacts got an error",
    );
  });
});

// ---------------------------------------------------------------------------
// removeContactFromGroup
// ---------------------------------------------------------------------------

describe("removeContactFromGroup", () => {
  it("returns success message with contact and group names", () => {
    mockExecFileSync.mockReturnValue("removed");

    expect(removeContactFromGroup("Alice Smith", "Work")).toEqual({
      success: true,
      message: 'Removed "Alice Smith" from group "Work"',
    });
  });
});

// ---------------------------------------------------------------------------
// exportContactVCard
// ---------------------------------------------------------------------------

describe("exportContactVCard", () => {
  it("returns the trimmed vCard string from AppleScript", () => {
    const vcard =
      "BEGIN:VCARD\nVERSION:3.0\nN:Smith;Alice;;;\nEND:VCARD\n";
    mockExecFileSync.mockReturnValue(vcard);

    expect(exportContactVCard("Alice Smith")).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nN:Smith;Alice;;;\nEND:VCARD",
    );
  });
});

// ---------------------------------------------------------------------------
// runAppleScript error handling (tested indirectly)
// ---------------------------------------------------------------------------

describe("runAppleScript error handling", () => {
  it("wraps Error with stderr property into AppleScript error message", () => {
    const err = Object.assign(new Error("cmd failed"), {
      stderr: "script error detail",
    });
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });

    expect(() => listGroups()).toThrow("AppleScript error: script error detail");
  });

  it("wraps non-Error thrown values into AppleScript error message", () => {
    mockExecFileSync.mockImplementation(() => {
      throw "raw string error";
    });

    expect(() => listGroups()).toThrow("AppleScript error: raw string error");
  });

  it("strips absolute file paths from error messages", () => {
    const err = Object.assign(new Error("cmd failed"), {
      stderr: "execution error: /Users/john/Library/Scripts/foo.scpt: error -1",
    });
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });

    expect(() => listGroups()).toThrow("<path>");
    try {
      listGroups();
    } catch (e: unknown) {
      expect((e as Error).message).not.toContain("/Users/john");
    }
  });
});

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------

describe("updateContact", () => {
  /** The script passed to osascript on the last call. */
  const lastScript = () => mockExecFileSync.mock.calls.at(-1)![1]![1] as string;

  it("addresses the person by id and sets only the given fields", () => {
    mockExecFileSync.mockReturnValue("updated");

    expect(updateContact("ABC:ABPerson", { nickname: "Ali", lastName: "" })).toEqual({
      success: true,
      message: "Contact updated",
    });
    const script = lastScript();
    expect(script).toContain('set p to person id "ABC:ABPerson"');
    expect(script).toContain('set nickname of p to "Ali"');
    expect(script).toContain('set last name of p to ""'); // empty string clears the field
    expect(script).not.toContain("first name");
    expect(script).not.toContain("phone");
  });

  it("builds the birthday from numbers, day reset first", () => {
    mockExecFileSync.mockReturnValue("updated");

    updateContact("id", { birthday: "1990-02-28" });
    const script = lastScript();
    expect(script.indexOf("set day of bd to 1")).toBeLessThan(script.indexOf("set month of bd to 2"));
    expect(script).toContain("set year of bd to 1990");
    expect(script).toContain("set day of bd to 28");
  });

  it("replaces phones and emails", () => {
    mockExecFileSync.mockReturnValue("updated");

    updateContact("id", { phoneNumbers: ["+1 415"], emailAddresses: ["a@b.co"] });
    const script = lastScript();
    expect(script).toContain("delete every phone of p");
    expect(script).toContain('value:"+1 415"');
    expect(script).toContain("delete every email of p");
    expect(script).toContain('value:"a@b.co"');
  });

  it("escapes quotes in values and the identifier", () => {
    mockExecFileSync.mockReturnValue("updated");

    updateContact('x" & do shell script "id', { nickname: 'a"b' });
    const script = lastScript();
    expect(script).toContain('person id "x\\" & do shell script \\"id"');
    expect(script).toContain('set nickname of p to "a\\"b"');
  });

  it("reports not found", () => {
    mockExecFileSync.mockReturnValue("not_found");

    expect(updateContact("missing", { nickname: "x" })).toEqual({
      success: false,
      message: "Contact not found",
    });
  });
});
