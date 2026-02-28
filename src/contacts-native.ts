import type { ContactBasic, ContactFull, ContactInput } from "./types.js";

// Import the native addon with a safety net — if it was compiled against a
// different Node.js ABI or the binary is missing, fail with a clear message
// instead of silently crashing the MCP server process.
let contacts: typeof import("node-mac-contacts").default;
try {
  contacts = (await import("node-mac-contacts")).default;
} catch (err) {
  console.error(
    "connector-contacts: failed to load native module 'node-mac-contacts'. " +
      "This usually means the addon was built for a different Node.js version. " +
      "Run 'npm rebuild node-mac-contacts' to fix.",
    err,
  );
  process.exit(1);
}

/**
 * All extra properties supported by node-mac-contacts.
 * Passing these to getAllContacts/getContactsByName fetches the full contact record.
 */
const ALL_EXTRA_PROPERTIES = [
  "jobTitle",
  "departmentName",
  "organizationName",
  "middleName",
  "note",
  "urlAddresses",
  "socialProfiles",
  "instantMessageAddresses",
];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function getAuthStatus(): string {
  return contacts.getAuthStatus();
}

export async function requestAccess(): Promise<string> {
  return contacts.requestAccess();
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getAllContacts(): ContactBasic[] {
  return contacts.getAllContacts() as ContactBasic[];
}

export function searchContacts(query: string): ContactBasic[] {
  const results = contacts.getContactsByName(query) as ContactBasic[];
  if (results.length > 0) return results;

  // Fallback: Apple's CNContact predicateForContactsMatchingName: can miss
  // multi-word queries due to Unicode normalization quirks (NFD vs NFC) and
  // tokenization edge cases.  When the native API returns nothing, do a
  // manual case-insensitive search across all contacts.
  const q = query.toLowerCase().trim();
  if (!q) return results;

  return (contacts.getAllContacts() as ContactBasic[]).filter((c) => {
    const first = (c.firstName ?? "").toLowerCase();
    const last = (c.lastName ?? "").toLowerCase();
    const full = `${first} ${last}`.trim();
    return (
      full.includes(q) ||
      first.includes(q) ||
      last.includes(q) ||
      (c.nickname ?? "").toLowerCase().includes(q) ||
      c.emailAddresses?.some((e) => e.toLowerCase().includes(q)) ||
      c.phoneNumbers?.some((p) => p.includes(q))
    );
  });
}

/**
 * Fetch full details for a single contact by identifier.
 *
 * node-mac-contacts has no "get by id" API, so we search by name first
 * (using firstName + lastName from a basic lookup) and then filter by
 * identifier. This avoids loading every contact with extra properties.
 * Falls back to a full scan if the targeted search misses.
 */
export function getContactDetails(identifier: string): ContactFull | null {
  // First try a targeted approach: find the contact's name, then search with extras
  const basicAll = contacts.getAllContacts() as ContactBasic[];
  const basicMatch = basicAll.find((c) => c.identifier === identifier);

  if (basicMatch) {
    const searchName = basicMatch.firstName || basicMatch.lastName || "";
    if (searchName) {
      const detailed = contacts.getContactsByName(
        searchName,
        ALL_EXTRA_PROPERTIES,
      ) as ContactFull[];
      const match = detailed.find((c) => c.identifier === identifier);
      if (match) return match;
    }
  }

  // Fallback: full scan with all extra properties
  const allDetailed = contacts.getAllContacts(
    ALL_EXTRA_PROPERTIES,
  ) as ContactFull[];
  return allDetailed.find((c) => c.identifier === identifier) ?? null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function createContact(input: ContactInput): boolean {
  return contacts.addNewContact(input);
}

export function updateContact(
  input: ContactInput & { identifier: string },
): boolean {
  return contacts.updateContact(input);
}

export function deleteContact(identifier: string): boolean {
  return contacts.deleteContact({ identifier });
}
