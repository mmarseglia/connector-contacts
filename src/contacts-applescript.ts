import { execFileSync } from "node:child_process";
import { sanitizeErrorMessage } from "./utils.js";
import type { ContactInput } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute an AppleScript string via osascript.
 * Uses execFileSync (not exec) — arguments are passed as an array,
 * never interpolated through a shell, preventing shell injection.
 */
function runAppleScript(script: string): string {
  try {
    const result = execFileSync("osascript", ["-e", script], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    return result.trim();
  } catch (error: unknown) {
    const raw =
      error instanceof Error
        ? (error as NodeJS.ErrnoException & { stderr?: string }).stderr ||
          error.message
        : String(error);
    throw new Error(`AppleScript error: ${sanitizeErrorMessage(raw)}`);
  }
}

/**
 * Escape a string for safe embedding inside AppleScript double-quoted strings.
 * Prevents AppleScript injection from user-provided contact/group names.
 */
function escapeAS(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "")
    .replace(/\n/g, "");
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function listGroups(): string[] {
  const script = `tell application "Contacts" to return name of every group`;
  const result = runAppleScript(script);
  if (!result) return [];
  return result.split(", ");
}

export function createGroup(name: string): { success: boolean; message: string } {
  const script = `
tell application "Contacts"
  if not (exists group "${escapeAS(name)}") then
    make new group at end with properties {name:"${escapeAS(name)}"}
    save
    return "created"
  else
    return "exists"
  end if
end tell`;
  const result = runAppleScript(script);
  return {
    success: true,
    message: result === "created" ? `Group "${name}" created` : `Group "${name}" already exists`,
  };
}

export function deleteGroup(name: string): { success: boolean; message: string } {
  const script = `
tell application "Contacts"
  if exists group "${escapeAS(name)}" then
    delete group "${escapeAS(name)}"
    save
    return "deleted"
  else
    return "not_found"
  end if
end tell`;
  const result = runAppleScript(script);
  if (result === "not_found") {
    return { success: false, message: `Group "${name}" not found` };
  }
  return { success: true, message: `Group "${name}" deleted` };
}

export function getGroupMembers(groupName: string): string[] {
  const script = `
tell application "Contacts"
  if not (exists group "${escapeAS(groupName)}") then
    return "GROUP_NOT_FOUND"
  end if
  set memberNames to {}
  repeat with p in people of group "${escapeAS(groupName)}"
    set fullName to ""
    try
      set fullName to (first name of p) & " " & (last name of p)
    on error
      try
        set fullName to first name of p
      on error
        try
          set fullName to last name of p
        on error
          set fullName to "(unnamed)"
        end try
      end try
    end try
    set end of memberNames to fullName
  end repeat
  return memberNames as text
end tell`;
  const result = runAppleScript(script);
  if (result === "GROUP_NOT_FOUND") {
    throw new Error(`Group "${groupName}" not found`);
  }
  if (!result) return [];
  return result.split(", ");
}

export function addContactToGroup(
  contactName: string,
  groupName: string,
): { success: boolean; message: string } {
  const script = `
tell application "Contacts"
  set thePerson to first person whose name is "${escapeAS(contactName)}"
  add thePerson to group "${escapeAS(groupName)}"
  save
  return "added"
end tell`;
  runAppleScript(script);
  return {
    success: true,
    message: `Added "${contactName}" to group "${groupName}"`,
  };
}

export function removeContactFromGroup(
  contactName: string,
  groupName: string,
): { success: boolean; message: string } {
  const script = `
tell application "Contacts"
  remove (first person whose name is "${escapeAS(contactName)}") from group "${escapeAS(groupName)}"
  save
  return "removed"
end tell`;
  runAppleScript(script);
  return {
    success: true,
    message: `Removed "${contactName}" from group "${groupName}"`,
  };
}

// ---------------------------------------------------------------------------
// Contact update
// ---------------------------------------------------------------------------

// node-mac-contacts' updateContact ignores the identifier and always fails,
// so updates go through AppleScript, which can address a person by id.
const TEXT_PROPS = {
  firstName: "first name",
  lastName: "last name",
  middleName: "middle name",
  nickname: "nickname",
  jobTitle: "job title",
  departmentName: "department",
  organizationName: "organization",
} as const;

/** Only the fields that are present are changed; phones/emails replace all existing ones. */
export function updateContact(
  identifier: string,
  fields: Partial<ContactInput>,
): { success: boolean; message: string } {
  const lines: string[] = [];
  for (const [key, prop] of Object.entries(TEXT_PROPS)) {
    const value = fields[key as keyof typeof TEXT_PROPS];
    if (value !== undefined) lines.push(`set ${prop} of p to "${escapeAS(value)}"`);
  }
  if (fields.birthday !== undefined) {
    const [y, m, d] = fields.birthday.split("-").map(Number);
    // Day goes to 1 first so changing month/year never overflows (e.g. Jan 31 -> Feb).
    lines.push(
      "set bd to current date",
      "set day of bd to 1",
      `set year of bd to ${y}`,
      `set month of bd to ${m}`,
      `set day of bd to ${d}`,
      "set time of bd to 0",
      "set birth date of p to bd",
    );
  }
  if (fields.phoneNumbers) {
    lines.push("delete every phone of p");
    for (const n of fields.phoneNumbers) {
      lines.push(`make new phone at end of phones of p with properties {label:"mobile", value:"${escapeAS(n)}"}`);
    }
  }
  if (fields.emailAddresses) {
    lines.push("delete every email of p");
    for (const e of fields.emailAddresses) {
      lines.push(`make new email at end of emails of p with properties {label:"home", value:"${escapeAS(e)}"}`);
    }
  }

  const id = escapeAS(identifier);
  const script = `
tell application "Contacts"
  if not (exists person id "${id}") then return "not_found"
  set p to person id "${id}"
  ${lines.join("\n  ")}
  save
  return "updated"
end tell`;
  if (runAppleScript(script) === "not_found") {
    return { success: false, message: "Contact not found" };
  }
  return { success: true, message: "Contact updated" };
}

// ---------------------------------------------------------------------------
// vCard Export
// ---------------------------------------------------------------------------

export function exportContactVCard(contactName: string): string {
  const script = `
tell application "Contacts"
  return vcard of (first person whose name is "${escapeAS(contactName)}") as text
end tell`;
  return runAppleScript(script);
}
