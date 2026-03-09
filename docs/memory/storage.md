# Memory Storage

## Database Schema

Memory is stored in a single Supabase table: `memory_files`.

```sql
create table memory_files (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  file_path  text not null,        -- e.g. "long-term/interests.md" or "daily/2026-02-12.md"
  category   text not null,        -- e.g. "interests", "daily", "meta"
  content    text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

- **Unique constraint** on `(user_id, file_path)` — used for upsert operations.
- **RLS enabled** — users can only access their own memory files.

## File Types

### Long-term files

**Path pattern**: `long-term/<category>.md`

Curated, stable facts about the user. One file per category.

**Format** (pipe-delimited):
```
- topic | details and context | YYYY-MM-DD
```

**Example** (`long-term/interests.md`):
```
- rock climbing | goes to the gym 3x/week, prefers bouldering | 2026-02-12
- cooking | likes making pasta from scratch | 2026-02-14
```

### Daily files

**Path pattern**: `daily/YYYY-MM-DD.md`

Append-only journal entries from that day's conversations. One file per day.

**Format** (bullet list):
```
- discussed X with Y context
- decided to Z
- mentioned feeling frustrated about W
```

## Categories

Seven long-term categories are defined in `lib/memory-types.ts`:

| Category | Description | UI Heading |
|----------|-------------|------------|
| `meta` | Name, age, location, biographical facts | About the User |
| `interests` | Hobbies, passions, curiosities | Interests |
| `projects` | Ongoing/side projects, what they're building | Projects |
| `work` | Job, role, company, colleagues | Work |
| `beliefs` | Values, opinions, worldviews, principles | Beliefs |
| `dislikes` | Things they dislike, avoid, frustrations | Dislikes |
| `people` | Family, friends, colleagues, relationships | People |

## Parsing and Serialization

`lib/memory-entries.ts` provides functions to convert between raw file content and structured entries:

- `parseLongTermFile(file)` — splits content by newlines, parses pipe-delimited entries into `{ topic, details, date }`
- `parseDailyFile(file)` — splits content by newlines, extracts bullet text into `{ text }`
- `serializeLongTermEntries(entries)` — joins entries back into pipe-delimited lines
- `serializeDailyEntries(entries)` — joins entries back into bullet lines

These are used by both the memory API (for editing/deleting individual entries) and the UI hook.
