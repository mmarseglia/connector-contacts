# connector-contacts

<img src="assets/connector-contacts.png" width="128" alt="connector-contacts icon" />

MCP server that gives Claude Desktop full read/write access to macOS Contacts. Search, create, update, and delete contacts, manage groups, and export vCards — all through natural conversation.

## Features

- **Contact CRUD** — search, list, create, update, and delete contacts
- **Group management** — create/delete groups, add/remove contacts from groups
- **vCard export** — export any contact as a VCF string
- **Permission-aware** — checks macOS authorization status and guides the user through granting access

## Prerequisites

- macOS (uses native Contacts framework and AppleScript)
- Node.js 20+
- Claude Desktop

## Install

### Option 1: MCP Bundle (recommended)

Build the `.mcpb` bundle and open it to install directly in Claude Desktop:

```bash
npm install
npm install -g @anthropic-ai/mcpb
npm run pack
```

This produces `connector-contacts.mcpb` in the project root. Double-click the file (or open it with Claude Desktop) to install the extension. All 14 tools will appear automatically.

### Option 2: Manual configuration

If you prefer manual setup, build and point Claude Desktop at the server entry point:

```bash
npm install
npm run build
```

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "contacts": {
      "command": "node",
      "args": ["/absolute/path/to/connector-contacts/server/index.js"]
    }
  }
}
```

Replace the path with the actual absolute path, then restart Claude Desktop.

## Permissions

On first use, macOS will prompt for two permissions:

| Permission | Purpose |
|---|---|
| **Contacts** (`kTCCServiceContacts`) | Read/write contact data via the native framework |
| **Automation** (`kTCCServiceAppleEvents`) | Control the Contacts app via AppleScript (groups, vCard) |

Both prompts appear for Claude Desktop (the parent process). If you accidentally deny either, reset with:

```bash
tccutil reset AddressBook com.anthropic.claudefordesktop
tccutil reset AppleEvents com.anthropic.claudefordesktop
```

Then restart Claude Desktop and try again.

## Tools Reference

### Auth

| Tool | Description |
|---|---|
| `check_contacts_access` | Check macOS authorization status for Contacts access |

### Contact CRUD

| Tool | Key Parameters | Description |
|---|---|---|
| `search_contacts` | `query` | Search contacts by name (first, last, or full) |
| `get_all_contacts` | — | List all contacts with basic info |
| `get_contact_details` | `identifier` | Full details for one contact (job, org, notes, socials) |
| `create_contact` | `firstName` (required), `lastName`, `phoneNumbers`, `emailAddresses`, ... | Create a new contact |
| `update_contact` | `identifier` (required), any field to change | Update an existing contact (unchanged fields preserved) |
| `delete_contact` | `identifier` | Permanently delete a contact |

### Group Management

| Tool | Key Parameters | Description |
|---|---|---|
| `list_groups` | — | List all contact groups |
| `create_group` | `name` | Create a new group |
| `delete_group` | `name` | Delete a group (contacts are NOT deleted) |
| `get_group_members` | `groupName` | List contacts in a group |
| `add_contact_to_group` | `contactName`, `groupName` | Add a contact to a group |
| `remove_contact_from_group` | `contactName`, `groupName` | Remove a contact from a group |

### Export

| Tool | Key Parameters | Description |
|---|---|---|
| `export_contact_vcard` | `contactName` | Export a contact as a vCard (VCF) string |

## Architecture

The server uses a **hybrid backend**:

- **`node-mac-contacts`** (native Node.js addon) — handles contact CRUD operations. Returns structured JavaScript objects with fast, direct access to the macOS Contacts framework.
- **AppleScript** (via `osascript`) — handles group management and vCard export, which are not supported by the native module. Executed safely using `execFileSync` with array arguments (no shell interpolation).

```
src/
├── index.ts                  # MCP server + all tool registrations
├── contacts-native.ts        # node-mac-contacts wrapper (CRUD)
├── contacts-applescript.ts   # AppleScript executor (groups, vCard)
├── types.ts                  # Shared TypeScript interfaces
└── node-mac-contacts.d.ts    # Type declarations for native module
```

## Development

Watch mode for continuous compilation during development:

```bash
npm run dev
```

## Privacy Policy

**connector-contacts** runs entirely on your Mac and never sends your data anywhere.

- **Data collection** — This server reads and writes contact data exclusively through the macOS Contacts framework and AppleScript. It does not collect, log, or transmit any contact data outside of your machine.
- **Network access** — The server makes zero network requests. All operations are local to the macOS Contacts database.
- **Third-party sharing** — No contact data is shared with third parties. The server has no analytics, telemetry, or crash-reporting services.
- **Data storage** — The server does not maintain its own data store. All contact data lives in the system Contacts database managed by macOS.
- **Data retention** — No contact data is cached or persisted by the server. Each tool call reads from or writes to macOS Contacts in real time.
- **Contact** — For questions or concerns, open an issue at [github.com/mmarseglia/connector-contacts](https://github.com/mmarseglia/connector-contacts/issues).
