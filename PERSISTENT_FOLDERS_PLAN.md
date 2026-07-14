# Persistent Folders Plan

## Current Temporary Model
- The portal currently treats document `category` values as folders.
- Users can create empty folder placeholders in browser storage for design and workflow testing.
- Moving a document between folders saves by updating `documents.category`.
- This is useful for the current UI pass, but it is not a true shared folder system.

## Limitations of the Current Model
- Empty folders are not stored in Supabase yet.
- Folder placeholders are browser-local, not shared across users.
- There is no folder ID, parent-child relationship, or nesting model.
- Documents cannot support robust move/audit workflows beyond changing one text field.
- Folder permissions cannot be separated from document permissions.

## Recommended Persistent Design

### Option A: Simple Flat Folders
- Add `folder_id uuid null` to `public.documents`
- Create `public.document_folders`

Suggested columns for `public.document_folders`:
- `id uuid primary key`
- `client_id uuid not null references clients(id)`
- `name text not null`
- `slug text not null`
- `created_by uuid null references users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested constraints:
- Unique on `(client_id, slug)`
- Index on `(client_id, name)`

Suggested updates to `public.documents`:
- Add `folder_id uuid null references document_folders(id)`
- Keep `category` temporarily for migration/backward compatibility

### Option B: Nested Folders
- Same as Option A, plus `parent_folder_id uuid null references document_folders(id)`
- Only do this if nested folders are definitely required
- If not needed, avoid the complexity for now

## Recommended Migration Path
1. Create `document_folders`
2. Backfill one folder per distinct `documents.category` per client
3. Update each document to point at the matching `folder_id`
4. Update portal reads/writes to use `folder_id`
5. Keep `category` as fallback for one release
6. Remove `category` from active UI usage after validation

## Portal Changes Needed Later
- Replace category-based folder lists with `document_folders`
- Create folder via insert into `document_folders`
- Move document via update to `documents.folder_id`
- Show empty folders from DB, not browser storage
- Add delete/rename folder flows
- Optionally support drag-and-drop moves

## Backend / Policy Notes
- Mirror `documents` client-scoped RLS on `document_folders`
- Client members: `SELECT`
- Admins: `INSERT`, `UPDATE`, `DELETE`
- If deleting folders is allowed, define behavior for documents inside:
- Recommended: prevent delete unless empty, or move docs to `null` / “General”

## Why This Should Wait Until Design Is Final
- The current UI layout can be validated quickly using category-backed folders
- Persistent folders should be built after the final interaction model is approved
- That avoids backend churn while the document workspace layout is still evolving
