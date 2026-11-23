import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the native module before any imports that depend on it.
// Vitest hoists vi.mock() above all imports automatically.
vi.mock("node-mac-contacts", () => {
  const mod = {
    getAuthStatus: vi.fn(),
    requestAccess: vi.fn(),
    getAllContacts: vi.fn(),
    getContactsByName: vi.fn(),
    addNewContact: vi.fn(),
    deleteContact: vi.fn(),
  };
  return { default: mod, ...mod };
});

import contacts from "node-mac-contacts";
import type { ContactBasic, ContactFull, ContactInput } from "./types.js";
import {
  getAuthStatus,
  requestAccess,
  ensureAccess,
  getAllContacts,
  searchContacts,
  getContactDetails,
  createContact,
  deleteContact,
} from "./contacts-native.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ALICE: ContactBasic = {
  identifier: "id-alice-001",
  firstName: "Alice",
  lastName: "Smith",
  nickname: "",
  birthday: "1990-05-15",
  phoneNumbers: ["+14155551234"],
  emailAddresses: ["alice@example.com"],
  postalAddresses: [],
};

const CONTACT_BOB: ContactBasic = {
  identifier: "id-bob-002",
  firstName: "Bob",
  lastName: "",
  nickname: "Bobby",
  birthday: "",
  phoneNumbers: [],
  emailAddresses: ["bob@example.com"],
  postalAddresses: [],
};

const CONTACT_ALICE_FULL: ContactFull = {
  ...CONTACT_ALICE,
  jobTitle: "Engineer",
  departmentName: "R&D",
  organizationName: "Acme Corp",
  middleName: "Marie",
  note: "VIP contact",
  socialProfiles: [{ label: "Twitter", value: "@alice" }],
  instantMessageAddresses: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Most operations call ensureAccess() internally, which checks getAuthStatus.
// Default to "Authorized" so existing tests pass without extra mocking.
beforeEach(() => {
  vi.mocked(contacts.getAuthStatus).mockReturnValue("Authorized");
});

describe("ensureAccess", () => {
  it("resolves immediately when status is Authorized", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Authorized");

    await expect(ensureAccess()).resolves.toBeUndefined();
    expect(contacts.requestAccess).not.toHaveBeenCalled();
  });

  it("resolves immediately when status is Limited", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Limited");

    await expect(ensureAccess()).resolves.toBeUndefined();
    expect(contacts.requestAccess).not.toHaveBeenCalled();
  });

  it("calls requestAccess when status is Not Determined and resolves on Authorized", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Not Determined");
    vi.mocked(contacts.requestAccess).mockResolvedValue("Authorized");

    await expect(ensureAccess()).resolves.toBeUndefined();
    expect(contacts.requestAccess).toHaveBeenCalled();
  });

  it("throws when status is Not Determined and user denies access", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Not Determined");
    vi.mocked(contacts.requestAccess).mockResolvedValue("Denied");

    await expect(ensureAccess()).rejects.toThrow(
      /Contacts access was not granted/,
    );
  });

  it("throws when status is Denied", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Denied");

    await expect(ensureAccess()).rejects.toThrow(
      /Contacts access is currently "Denied"/,
    );
    expect(contacts.requestAccess).not.toHaveBeenCalled();
  });

  it("throws when status is Restricted", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Restricted");

    await expect(ensureAccess()).rejects.toThrow(
      /Contacts access is currently "Restricted"/,
    );
  });
});

describe("getAuthStatus", () => {
  it("returns the authorization status string from the native module", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Authorized");

    expect(await getAuthStatus()).toBe("Authorized");
  });

  it("propagates other status values like Denied", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Denied");

    expect(await getAuthStatus()).toBe("Denied");
  });
});

describe("requestAccess", () => {
  it("returns the resolved access result from the native module", async () => {
    vi.mocked(contacts.requestAccess).mockResolvedValue("Authorized");

    expect(await requestAccess()).toBe("Authorized");
  });
});

describe("getAllContacts", () => {
  it("returns all contacts from the native module with search extras", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    expect(await getAllContacts()).toEqual([CONTACT_ALICE, CONTACT_BOB]);
    expect(contacts.getAllContacts).toHaveBeenCalledWith(["jobTitle", "organizationName"]);
  });

  it("returns an empty array when no contacts exist", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValue([]);

    expect(await getAllContacts()).toEqual([]);
  });
});

describe("searchContacts", () => {
  it("passes the query to getContactsByName with search extras and returns results", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([CONTACT_ALICE]);

    const results = await searchContacts("Alice");

    expect(results).toEqual([CONTACT_ALICE]);
    expect(contacts.getContactsByName).toHaveBeenCalledWith("Alice", ["jobTitle", "organizationName"]);
  });

  it("falls back to manual search when getContactsByName returns empty", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Alice Smith");

    expect(results).toEqual([CONTACT_ALICE]);
    expect(contacts.getAllContacts).toHaveBeenCalledWith(["jobTitle", "organizationName"]);
  });

  it("fallback matches on first name alone", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Alice");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("fallback matches on last name alone", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Smith");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("fallback matches on nickname", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Bobby");

    expect(results).toEqual([CONTACT_BOB]);
  });

  it("fallback matches on email address", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("alice@example.com");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("fallback is case-insensitive", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("alice smith");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("does not trigger fallback when native API returns results", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([CONTACT_ALICE]);

    await searchContacts("Alice");

    expect(contacts.getAllContacts).not.toHaveBeenCalled();
  });

  it("returns empty array when neither native nor fallback finds matches", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Zara");

    expect(results).toEqual([]);
  });
});

describe("getContactDetails", () => {
  it("returns full contact via targeted name search (happy path)", async () => {
    // First call: getAllContacts() with no args → basic list
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    // Targeted search by first name with extra properties
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    const result = await getContactDetails("id-alice-001");

    expect(result).toEqual(CONTACT_ALICE_FULL);
    expect(contacts.getContactsByName).toHaveBeenCalledWith(
      "Alice",
      expect.any(Array),
    );
  });

  it("falls back to full scan when targeted search misses", async () => {
    // First call: basic lookup finds Alice
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    // Targeted search returns empty (miss)
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([]);
    // Fallback: full scan with extras finds Alice
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    const result = await getContactDetails("id-alice-001");

    expect(result).toEqual(CONTACT_ALICE_FULL);
    // getAllContacts should have been called twice (basic + fallback with extras)
    expect(contacts.getAllContacts).toHaveBeenCalledTimes(2);
  });

  it("falls back to full scan when contact has no name", async () => {
    const noNameBasic: ContactBasic = {
      ...CONTACT_ALICE,
      identifier: "id-noname",
      firstName: "",
      lastName: "",
    };
    const noNameFull: ContactFull = {
      ...CONTACT_ALICE_FULL,
      identifier: "id-noname",
      firstName: "",
      lastName: "",
    };

    // Basic lookup finds the nameless contact
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([noNameBasic]);
    // Fallback full scan (searchName is empty, so getContactsByName is skipped)
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([noNameFull]);

    const result = await getContactDetails("id-noname");

    expect(result).toEqual(noNameFull);
    // getContactsByName should NOT be called because searchName is ""
    expect(contacts.getContactsByName).not.toHaveBeenCalled();
  });

  it("returns null when identifier is not found anywhere", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);
    // Fallback full scan also doesn't find the id
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    const result = await getContactDetails("nonexistent-id");

    expect(result).toBeNull();
  });
});

describe("createContact", () => {
  it("returns the id that was not there before, not an older namesake", async () => {
    const OLD = { ...CONTACT_ALICE, identifier: "id-old" };
    const NEW = { ...CONTACT_ALICE, identifier: "id-new" };
    vi.mocked(contacts.getContactsByName)
      .mockReturnValueOnce([OLD])
      .mockReturnValueOnce([OLD, NEW]);
    vi.mocked(contacts.addNewContact).mockReturnValue(true);

    const input = { firstName: "Alice", lastName: "Smith" };
    expect(await createContact(input)).toEqual({ success: true, identifier: "id-new" });
    expect(contacts.addNewContact).toHaveBeenCalledWith(input);
  });

  it("returns success false when the native add fails", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([]);
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([]);
    vi.mocked(contacts.addNewContact).mockReturnValue(false);

    expect(await createContact({ firstName: "Zed" })).toEqual({ success: false, identifier: null });
  });
});

describe("deleteContact", () => {
  it("wraps identifier in an object and passes to deleteContact", async () => {
    vi.mocked(contacts.deleteContact).mockReturnValue(true);

    expect(await deleteContact("id-1")).toBe(true);
    expect(contacts.deleteContact).toHaveBeenCalledWith({ identifier: "id-1" });
  });
});

// ===========================================================================
// Bug 1 — get_contact_details: extraProperties must only contain values
// accepted by the native node-mac-contacts module.
//
// The native module's validateContactArg() rejects any extraProperties entry
// not in: jobTitle, departmentName, organizationName, middleName, note,
// contactImage, contactThumbnailImage, instantMessageAddresses, socialProfiles.
//
// "urlAddresses" is NOT a valid extra property — including it causes
// getAllContacts() and getContactsByName() to throw.
// ===========================================================================

describe("Bug 1: getContactDetails only passes valid extra properties", () => {
  /**
   * The set of extra properties the native module actually accepts.
   * If ALL_EXTRA_PROPERTIES in contacts-native.ts contains anything outside
   * this set, the native module will throw a validation error.
   */
  const VALID_EXTRA_PROPERTIES = [
    "jobTitle",
    "departmentName",
    "organizationName",
    "middleName",
    "note",
    "contactImage",
    "contactThumbnailImage",
    "instantMessageAddresses",
    "socialProfiles",
  ];

  it("only passes valid extra properties to getContactsByName (targeted search)", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([CONTACT_ALICE_FULL]);

    await getContactDetails("id-alice-001");

    const passedExtras = vi.mocked(contacts.getContactsByName).mock.calls[0][1] as string[];
    for (const prop of passedExtras) {
      expect(
        VALID_EXTRA_PROPERTIES,
        `"${prop}" is not a valid extraProperty accepted by node-mac-contacts`,
      ).toContain(prop);
    }
  });

  it("only passes valid extra properties to getAllContacts (fallback full scan)", async () => {
    // Force the fallback path: basic lookup finds Alice, but targeted search misses
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([]);
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE_FULL]);

    await getContactDetails("id-alice-001");

    // The second getAllContacts call is the fallback with ALL_EXTRA_PROPERTIES
    const fallbackCall = vi.mocked(contacts.getAllContacts).mock.calls[1];
    const passedExtras = fallbackCall[0] as string[];
    for (const prop of passedExtras) {
      expect(
        VALID_EXTRA_PROPERTIES,
        `"${prop}" is not a valid extraProperty accepted by node-mac-contacts`,
      ).toContain(prop);
    }
  });

  it("does not include 'urlAddresses' in extra properties", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([CONTACT_ALICE_FULL]);

    await getContactDetails("id-alice-001");

    const passedExtras = vi.mocked(contacts.getContactsByName).mock.calls[0][1] as string[];
    expect(
      passedExtras,
      "urlAddresses is not a valid extraProperty — it causes a validation error in node-mac-contacts",
    ).not.toContain("urlAddresses");
  });

  it("reproduces the native module error when urlAddresses is included", async () => {
    // Simulate the actual native module behavior: it throws when given
    // an invalid extra property like "urlAddresses".
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockImplementationOnce(
      (_name: string, extraProperties?: string[]) => {
        if (extraProperties?.includes("urlAddresses")) {
          throw new Error(
            "properties in extraProperties must be one of jobTitle, departmentName, " +
            "organizationName, middleName, note, contactImage, contactThumbnailImage, " +
            "instantMessageAddresses, socialProfiles",
          );
        }
        return [CONTACT_ALICE_FULL];
      },
    );

    // Bug is fixed: urlAddresses is no longer in ALL_EXTRA_PROPERTIES,
    // so the native module no longer throws.
    await expect(getContactDetails("id-alice-001")).resolves.not.toThrow();
  });
});
