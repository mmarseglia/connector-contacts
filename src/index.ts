#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import * as native from "./contacts-native.js";
import * as applescript from "./contacts-applescript.js";
import { toolResult, toolError } from "./utils.js";

const server = new McpServer({
  name: "connector-contacts",
  version: "1.0.0",
});

// ===========================================================================
// Auth
// ===========================================================================

server.tool(
  "check_contacts_access",
  "Check if the server has permission to access macOS Contacts. Returns the current authorization status.",
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const status = native.getAuthStatus();
      let hint = "";
      if (status === "Not Determined") {
        hint = "Permission has not been requested yet. The first contact operation will trigger the system prompt.";
      } else if (status === "Denied") {
        hint = "Permission was denied. The user needs to enable Contacts access for Claude Desktop in System Settings > Privacy & Security > Contacts.";
      }
      return toolResult({ status, hint });
    } catch (err) {
      return toolError(err);
    }
  },
);

// ===========================================================================
// Contact CRUD
// ===========================================================================

server.tool(
  "search_contacts",
  "Search for contacts by name. Matches across first name, last name, and full name. Returns basic contact info including identifiers for use with other tools.",
  { query: z.string().min(1).describe("Name to search for (first, last, or full name)") },
  { readOnlyHint: true },
  async ({ query }) => {
    try {
      const results = native.searchContacts(query);
      return toolResult({ count: results.length, contacts: results });
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "get_all_contacts",
  "Get all contacts from the address book. Returns basic info (name, phone, email) for every contact. For large address books, prefer search_contacts for targeted lookups.",
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const results = native.getAllContacts();
      return toolResult({ count: results.length, contacts: results });
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "get_contact_details",
  "Get full details for a specific contact by their identifier. Returns extended properties including job title, organization, notes, social profiles, and more.",
  { identifier: z.string().min(1).describe("Contact identifier (from search_contacts or get_all_contacts results)") },
  { readOnlyHint: true },
  async ({ identifier }) => {
    try {
      const contact = native.getContactDetails(identifier);
      if (!contact) {
        return toolResult({ error: "Contact not found", identifier });
      }
      return toolResult(contact);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "create_contact",
  "Create a new contact in the macOS address book. Only firstName is required; all other fields are optional.",
  {
    firstName: z.string().min(1).max(500).describe("First name (required)"),
    lastName: z.string().max(500).optional().describe("Last name"),
    nickname: z.string().max(500).optional().describe("Nickname"),
    middleName: z.string().max(500).optional().describe("Middle name"),
    jobTitle: z.string().max(500).optional().describe("Job title"),
    departmentName: z.string().max(500).optional().describe("Department name"),
    organizationName: z.string().max(500).optional().describe("Organization / company name"),
    birthday: z.string().optional().describe("Birthday in YYYY-MM-DD format"),
    phoneNumbers: z.array(z.string()).optional().describe("Phone numbers (E.164 format preferred, e.g. +14155551234)"),
    emailAddresses: z.array(z.string()).optional().describe("Email addresses"),
    urlAddresses: z.array(z.string()).optional().describe("URLs (website, social profile, etc.)"),
  },
  { readOnlyHint: false },
  async (input) => {
    try {
      const success = native.createContact(input);
      if (success) {
        // Attempt to find the newly created contact to return its identifier
        const matches = native.searchContacts(input.firstName);
        const newContact = matches.find(
          (c) =>
            c.firstName === input.firstName &&
            (!input.lastName || c.lastName === input.lastName),
        );
        return toolResult({
          success: true,
          message: `Contact "${input.firstName}${input.lastName ? " " + input.lastName : ""}" created`,
          identifier: newContact?.identifier ?? null,
        });
      }
      return toolResult({ success: false, message: "Failed to create contact" });
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "update_contact",
  "Update an existing contact. Provide the contact's identifier and only the fields you want to change — other fields are left untouched.",
  {
    identifier: z.string().min(1).describe("Contact identifier to update"),
    firstName: z.string().min(1).max(500).optional().describe("New first name"),
    lastName: z.string().max(500).optional().describe("New last name"),
    nickname: z.string().max(500).optional().describe("New nickname"),
    middleName: z.string().max(500).optional().describe("New middle name"),
    jobTitle: z.string().max(500).optional().describe("New job title"),
    departmentName: z.string().max(500).optional().describe("New department name"),
    organizationName: z.string().max(500).optional().describe("New organization / company name"),
    birthday: z.string().optional().describe("New birthday in YYYY-MM-DD format"),
    phoneNumbers: z.array(z.string()).optional().describe("Replace phone numbers"),
    emailAddresses: z.array(z.string()).optional().describe("Replace email addresses"),
    urlAddresses: z.array(z.string()).optional().describe("Replace URLs"),
  },
  { readOnlyHint: false },
  async ({ identifier, ...fields }) => {
    try {
      // Fetch current contact to preserve fields not being updated
      const current = native.getContactDetails(identifier);
      if (!current) {
        return toolResult({ success: false, error: "Contact not found", identifier });
      }

      const updatePayload = {
        identifier,
        firstName: fields.firstName ?? current.firstName,
        lastName: fields.lastName ?? current.lastName,
        nickname: fields.nickname ?? current.nickname,
        middleName: fields.middleName ?? current.middleName,
        jobTitle: fields.jobTitle ?? current.jobTitle,
        departmentName: fields.departmentName ?? current.departmentName,
        organizationName: fields.organizationName ?? current.organizationName,
        birthday: fields.birthday ?? current.birthday,
        phoneNumbers: fields.phoneNumbers,
        emailAddresses: fields.emailAddresses,
        urlAddresses: fields.urlAddresses,
      };

      const success = native.updateContact(updatePayload);
      return toolResult({
        success,
        message: success ? "Contact updated" : "Failed to update contact",
      });
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "delete_contact",
  "Permanently delete a contact from the macOS address book. This cannot be undone.",
  { identifier: z.string().min(1).describe("Contact identifier to delete") },
  { readOnlyHint: false, destructiveHint: true },
  async ({ identifier }) => {
    try {
      const success = native.deleteContact(identifier);
      return toolResult({
        success,
        message: success ? "Contact deleted" : "Failed to delete contact",
      });
    } catch (err) {
      return toolError(err);
    }
  },
);

// ===========================================================================
// Group Management (AppleScript)
// ===========================================================================

server.tool(
  "list_groups",
  "List all contact groups in the macOS address book.",
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const groups = applescript.listGroups();
      return toolResult({ count: groups.length, groups });
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "create_group",
  "Create a new contact group in the address book.",
  { name: z.string().min(1).max(500).describe("Name for the new group") },
  { readOnlyHint: false },
  async ({ name }) => {
    try {
      const result = applescript.createGroup(name);
      return toolResult(result);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "delete_group",
  "Delete a contact group. The contacts in the group are NOT deleted — only the group itself is removed.",
  { name: z.string().min(1).max(500).describe("Name of the group to delete") },
  { readOnlyHint: false, destructiveHint: true },
  async ({ name }) => {
    try {
      const result = applescript.deleteGroup(name);
      return toolResult(result);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "get_group_members",
  "List all contacts that belong to a specific group.",
  { groupName: z.string().min(1).max(500).describe("Name of the group") },
  { readOnlyHint: true },
  async ({ groupName }) => {
    try {
      const members = applescript.getGroupMembers(groupName);
      return toolResult({ group: groupName, count: members.length, members });
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "add_contact_to_group",
  "Add an existing contact to a group. The contact must exist in the address book.",
  {
    contactName: z.string().min(1).max(500).describe("Full name of the contact (e.g. \"John Doe\")"),
    groupName: z.string().min(1).max(500).describe("Name of the group to add the contact to"),
  },
  { readOnlyHint: false },
  async ({ contactName, groupName }) => {
    try {
      const result = applescript.addContactToGroup(contactName, groupName);
      return toolResult(result);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "remove_contact_from_group",
  "Remove a contact from a group. The contact is NOT deleted — only the group membership is removed.",
  {
    contactName: z.string().min(1).max(500).describe("Full name of the contact"),
    groupName: z.string().min(1).max(500).describe("Name of the group to remove the contact from"),
  },
  { readOnlyHint: false },
  async ({ contactName, groupName }) => {
    try {
      const result = applescript.removeContactFromGroup(contactName, groupName);
      return toolResult(result);
    } catch (err) {
      return toolError(err);
    }
  },
);

// ===========================================================================
// Export
// ===========================================================================

server.tool(
  "export_contact_vcard",
  "Export a contact as a vCard (VCF) string. The vCard can be saved to a .vcf file or shared.",
  { contactName: z.string().min(1).max(500).describe("Full name of the contact to export") },
  { readOnlyHint: true },
  async ({ contactName }) => {
    try {
      const vcard = applescript.exportContactVCard(contactName);
      return toolResult({ contactName, vcard });
    } catch (err) {
      return toolError(err);
    }
  },
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
  process.exit(1);
});
