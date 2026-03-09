# Memory API and UI

Users can view, edit, and delete their memories through a slide-out panel in the home page.

## API Routes

`app/api/memory/route.ts` exposes two endpoints:

### PATCH — Edit an entry

```
PATCH /api/memory
Body: { fileId, entryIndex, updated }
```

- `fileId` — the `memory_files.id` of the file containing the entry
- `entryIndex` — zero-based index of the entry within the parsed file
- `updated` — the new entry data (`LongTermEntry` or `DailyEntry`)

Reads the file, parses it, replaces the entry at `entryIndex`, serializes back to content, and writes the updated content to the database.

### DELETE — Remove an entry

```
DELETE /api/memory
Body: { fileId, entryIndex }
```

Reads the file, parses it, splices out the entry at `entryIndex`, and:
- If entries remain: writes updated content back
- If no entries remain: deletes the entire `memory_files` row

Both endpoints authenticate via Supabase server client and scope queries to the authenticated user.

## React Hook: `useMemory`

`app/home/components/useMemory.ts` provides the data layer for the UI:

### `load()`
- Fetches all long-term files (non-empty, non-daily)
- Fetches daily files from the last 7 days
- Parses each file into individual `MemoryEntry` objects with `fileId` and `entryIndex` references

### `updateEntry(entry, updated)`
- Optimistic update — immediately updates local state
- Sends PATCH request to the API
- Reverts to previous state on failure

### `deleteEntry(entry)`
- Optimistic removal — immediately removes from local state
- Re-indexes remaining entries in the same file (decrements `entryIndex` for entries after the deleted one)
- Sends DELETE request to the API
- Reverts on failure

## UI Components

### MemoryPanel

Slide-out panel triggered from the home page. Groups and displays:

1. **Long-term entries** — grouped by category in the order defined by `MEMORY_CATEGORIES`, with sticky category headings
2. **Daily entries** — grouped by date (newest first), under a "Recent Notes" heading with formatted date labels (Today, Yesterday, or weekday + date)

### MemoryEntry

Individual entry component with three states:

- **View mode** — displays topic/details (long-term) or text (daily), with edit/delete buttons visible on hover
- **Edit mode** — inline form with topic + details inputs (long-term) or textarea (daily), save/cancel buttons
- **Delete confirmation** — "Delete this memory?" prompt with confirm/cancel
