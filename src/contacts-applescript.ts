import { execFileSync } from "node:child_process";

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
    const msg =
      error instanceof Error
        ? (error as NodeJS.ErrnoException & { stderr?: string }).stderr ||
          error.message
        : String(error);
    throw new Error(`AppleScript error: ${msg}`);
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
// vCard Export
// ---------------------------------------------------------------------------

export function exportContactVCard(contactName: string): string {
  const script = `
tell application "Contacts"
  return vcard of (first person whose name is "${escapeAS(contactName)}") as text
end tell`;
  return runAppleScript(script);
}
