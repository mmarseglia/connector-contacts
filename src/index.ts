#!/usr/bin/env node

// Must be the very first import so handlers are active before any top-level
// await in other modules (e.g. native addon loading in contacts-native.ts).
import "./setup-handlers.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import * as native from "./contacts-native.js";
import * as applescript from "./contacts-applescript.js";
import { createContactFields, updateContactFields } from "./schemas.js";
import { toolHandler } from "./utils.js";

const server = new McpServer({
  name: "connector-contacts",
  version: "1.2.4",
});

// ===========================================================================
// Auth
// ===========================================================================

server.tool(
  "check_contacts_access",
  "Check if the server has permission to access macOS Contacts. Returns the current authorization status.",
  {},
  { readOnlyHint: true },
  toolHandler(async () => {
    let status = await native.getAuthStatus();
    let hint = "";
    if (status === "Not Determined") {
      status = await native.requestAccess();
      hint = status === "Authorized"
        ? "Permission was just granted. Contacts are now accessible."
        : `Permission prompt was shown but access was not granted (status: ${status}). Please enable Contacts access in System Settings > Privacy & Security > Contacts.`;
    } else if (status === "Denied" || status === "Restricted") {
      hint = "Permission was denied. The user needs to enable Contacts access in System Settings > Privacy & Security > Contacts.";
    } else if (status === "Limited") {
      hint = "Limited access granted (macOS 15+). Only contacts the user explicitly selected are visible. Grant full access in System Settings > Privacy & Security > Contacts.";
    }
    return { status, hint };
  }),
);

// ===========================================================================
// Contact CRUD
// ===========================================================================

server.tool(
  "search_contacts",
  "Search for contacts by name. Matches across first name, last name, and full name. Returns basic contact info including identifiers for use with other tools.",
  { query: z.string().min(1).describe("Name to search for (first, last, or full name)") },
  { readOnlyHint: true },
  toolHandler(async ({ query }: { query: string }) => {
    const results = await native.searchContacts(query);
    return { count: results.length, contacts: results };
  }),
);

server.tool(
  "get_all_contacts",
  "Get all contacts from the address book. Returns basic info (name, phone, email) for every contact. For large address books, prefer search_contacts for targeted lookups.",
  {},
  { readOnlyHint: true },
  toolHandler(async () => {
    const results = await native.getAllContacts();
    return { count: results.length, contacts: results };
  }),
);

server.tool(
  "get_contact_details",
  "Get full details for a specific contact by their identifier. Returns extended properties including job title, organization, notes, social profiles, and more. May read multiple contacts internally to locate the requested record.",
  { identifier: z.string().min(1).describe("Contact identifier (from search_contacts or get_all_contacts results)") },
  { readOnlyHint: true },
  toolHandler(async ({ identifier }: { identifier: string }) => {
    const contact = await native.getContactDetails(identifier);
    return contact ?? { error: "Contact not found", identifier };
  }),
);

server.tool(
  "create_contact",
  "Create a new contact in the macOS address book. Only firstName is required; all other fields are optional.",
  createContactFields,
  { readOnlyHint: false },
  toolHandler(async (input: z.objectOutputType<typeof createContactFields, z.ZodTypeAny>) => {
    const success = await native.createContact(input);
    if (!success) {
      return { success: false, message: "Failed to create contact" };
    }
    // Attempt to find the newly created contact to return its identifier
    const matches = await native.searchContacts(input.firstName);
    const newContact = matches.find(
      (c) =>
        c.firstName === input.firstName &&
        (!input.lastName || c.lastName === input.lastName),
    );
    return {
      success: true,
      message: `Contact "${input.firstName}${input.lastName ? " " + input.lastName : ""}" created`,
      identifier: newContact?.identifier ?? null,
    };
  }),
);

server.tool(
  "update_contact",
  "Update an existing contact. Provide the contact's identifier and only the fields you want to change — other fields are left untouched.",
  updateContactFields,
  { readOnlyHint: false },
  toolHandler(async ({ identifier, ...fields }: z.objectOutputType<typeof updateContactFields, z.ZodTypeAny>) => {
    // Fetch current contact to preserve fields not being updated
    const current = await native.getContactDetails(identifier);
    if (!current) {
      return { success: false, error: "Contact not found", identifier };
    }
    const success = await native.updateContact(
      native.mergeContactUpdate(identifier, fields, current),
    );
    return { success, message: success ? "Contact updated" : "Failed to update contact" };
  }),
);

server.tool(
  "delete_contact",
  "Permanently delete a contact from the macOS address book. This cannot be undone.",
  { identifier: z.string().min(1).describe("Contact identifier to delete") },
  { readOnlyHint: false, destructiveHint: true },
  toolHandler(async ({ identifier }: { identifier: string }) => {
    const success = await native.deleteContact(identifier);
    return { success, message: success ? "Contact deleted" : "Failed to delete contact" };
  }),
);

// ===========================================================================
// Group Management (AppleScript)
// ===========================================================================

server.tool(
  "list_groups",
  "List all contact groups in the macOS address book. Uses AppleScript (osascript) to query the Contacts app.",
  {},
  { readOnlyHint: true },
  toolHandler(() => {
    const groups = applescript.listGroups();
    return { count: groups.length, groups };
  }),
);

server.tool(
  "create_group",
  "Create a new contact group in the address book. Uses AppleScript (osascript) to modify the Contacts app.",
  { name: z.string().min(1).max(500).describe("Name for the new group") },
  { readOnlyHint: false },
  toolHandler(({ name }: { name: string }) => applescript.createGroup(name)),
);

server.tool(
  "delete_group",
  "Delete a contact group. The contacts in the group are NOT deleted — only the group itself is removed. Uses AppleScript (osascript) to modify the Contacts app.",
  { name: z.string().min(1).max(500).describe("Name of the group to delete") },
  { readOnlyHint: false, destructiveHint: true },
  toolHandler(({ name }: { name: string }) => applescript.deleteGroup(name)),
);

server.tool(
  "get_group_members",
  "List all contacts that belong to a specific group. Uses AppleScript (osascript) to query the Contacts app.",
  { groupName: z.string().min(1).max(500).describe("Name of the group") },
  { readOnlyHint: true },
  toolHandler(({ groupName }: { groupName: string }) => {
    const members = applescript.getGroupMembers(groupName);
    return { group: groupName, count: members.length, members };
  }),
);

server.tool(
  "add_contact_to_group",
  "Add an existing contact to a group. The contact must exist in the address book. Uses AppleScript (osascript) to modify the Contacts app.",
  {
    contactName: z.string().min(1).max(500).describe("Full name of the contact (e.g. \"John Doe\")"),
    groupName: z.string().min(1).max(500).describe("Name of the group to add the contact to"),
  },
  { readOnlyHint: false },
  toolHandler(({ contactName, groupName }: { contactName: string; groupName: string }) =>
    applescript.addContactToGroup(contactName, groupName),
  ),
);

server.tool(
  "remove_contact_from_group",
  "Remove a contact from a group. The contact is NOT deleted — only the group membership is removed. Uses AppleScript (osascript) to modify the Contacts app.",
  {
    contactName: z.string().min(1).max(500).describe("Full name of the contact"),
    groupName: z.string().min(1).max(500).describe("Name of the group to remove the contact from"),
  },
  { readOnlyHint: false },
  toolHandler(({ contactName, groupName }: { contactName: string; groupName: string }) =>
    applescript.removeContactFromGroup(contactName, groupName),
  ),
);

// ===========================================================================
// Export
// ===========================================================================

server.tool(
  "export_contact_vcard",
  "Export a contact as a vCard (VCF) string. The vCard can be saved to a .vcf file or shared. Uses AppleScript (osascript) to query the Contacts app.",
  { contactName: z.string().min(1).max(500).describe("Full name of the contact to export") },
  { readOnlyHint: true },
  toolHandler(({ contactName }: { contactName: string }) => {
    const vcard = applescript.exportContactVCard(contactName);
    return { contactName, vcard };
  }),
);

// ===========================================================================
// Start
// ===========================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("connector-contacts MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in connector-contacts:", error);
  process.exitCode = 1;
});
