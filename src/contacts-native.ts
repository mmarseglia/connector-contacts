import type { ContactBasic, ContactFull, ContactInput } from "./types.js";

// ---------------------------------------------------------------------------
// Lazy-load the native addon.  We deliberately do NOT use a top-level await
// here because:
//   1. It delays the MCP server from starting (the host may time-out or
//      restart the process while waiting).
//   2. If the native addon crashes at the C/C++ level (e.g. ABI mismatch →
//      SIGSEGV), a top-level await kills the process before the MCP transport
//      even exists, so the error cannot be reported through the protocol.
//
// Instead, the addon is loaded lazily on the first tool call.  By that point
// the server has already completed the MCP initialize handshake, and any load
// failure is returned as a normal tool error.
// ---------------------------------------------------------------------------

type NativeContacts = typeof import("node-mac-contacts").default;

let _loadPromise: Promise<NativeContacts> | null = null;

/**
 * Load (or return the cached) native module.
 * The promise is created once and reused for all subsequent calls.
 */
function loadNative(): Promise<NativeContacts> {
  if (!_loadPromise) {
    _loadPromise = import("node-mac-contacts")
      .then((mod) => {
        console.error(
          `connector-contacts: native module loaded (N-API ${process.versions.napi})`,
        );
        return mod.default;
      })
      .catch((err) => {
        const msg =
          "Failed to load native module 'node-mac-contacts'. " +
          "This usually means the addon was built for a different Node.js version or architecture. " +
          "Run 'npm rebuild node-mac-contacts' to fix. " +
          String(err);
        console.error("connector-contacts:", msg);
        // Reset so a retry is possible (e.g. after npm rebuild)
        _loadPromise = null;
        throw new Error(msg);
      });
  }
  return _loadPromise;
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

export async function getAuthStatus(): Promise<string> {
  const contacts = await loadNative();
  return contacts.getAuthStatus();
}

export async function requestAccess(): Promise<string> {
  const contacts = await loadNative();
  return contacts.requestAccess();
}

/**
 * Ensure the process has Contacts access before performing any operation.
 *
 * - "Not Determined" → calls requestAccess() to trigger the macOS permission
 *   dialog, then checks the result.
 * - "Authorized" → no-op (fast path).
 * - "Denied" / "Restricted" → throws with actionable instructions.
 * - "Limited" (macOS 15+) → proceeds (results may be incomplete).
 */
export async function ensureAccess(): Promise<void> {
  const status = await getAuthStatus();

  if (status === "Authorized" || status === "Limited") return;

  if (status === "Not Determined") {
    const result = await requestAccess();
    if (result === "Authorized" || result === "Limited") return;
    throw new Error(
      `Contacts access was not granted (status after prompt: ${result}). ` +
        "Please enable Contacts access in System Settings > Privacy & Security > Contacts.",
    );
  }

  // Denied, Restricted, or any unexpected status
  throw new Error(
    `Contacts access is currently "${status}". ` +
      "Please enable Contacts access in System Settings > Privacy & Security > Contacts. " +
      "You may need to run: tccutil reset AddressBook <bundle-id>",
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getAllContacts(): Promise<ContactBasic[]> {
  await ensureAccess();
  const contacts = await loadNative();
  return contacts.getAllContacts() as ContactBasic[];
}

export async function searchContacts(query: string): Promise<ContactBasic[]> {
  await ensureAccess();
  const contacts = await loadNative();
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
export async function getContactDetails(identifier: string): Promise<ContactFull | null> {
  await ensureAccess();
  const contacts = await loadNative();
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

export async function createContact(input: ContactInput): Promise<boolean> {
  await ensureAccess();
  const contacts = await loadNative();
  return contacts.addNewContact(input);
}

export async function updateContact(
  input: ContactInput & { identifier: string },
): Promise<boolean> {
  await ensureAccess();
  const contacts = await loadNative();
  return contacts.updateContact(input);
}

export async function deleteContact(identifier: string): Promise<boolean> {
  await ensureAccess();
  const contacts = await loadNative();
  return contacts.deleteContact({ identifier });
}
