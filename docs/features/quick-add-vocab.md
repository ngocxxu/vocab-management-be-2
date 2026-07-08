# Quick-Add Vocab (iOS Shortcut + API Key)

## What it is

A way to add a word to Vocab from anywhere on iOS — Safari, Apple Books, any app with selectable text — without opening the app. You select a word, share it to an iOS Shortcut, and the Shortcut calls the API directly using a personal API key. The word lands in a pre-configured language folder; translation happens asynchronously the same way it does for normal vocab creation.

A native iOS Share Extension was considered and rejected: it requires Xcode and code signing, and a free Apple ID build expires every 7 days unless re-signed. An iOS Shortcut with "Show in Share Sheet" enabled gets the same one-tap flow for $0 and no maintenance.

## API key

Manage keys from the **API Keys** page in the web app (visible to `ADMIN`/`MEMBER` roles, not `GUEST`).

- Each key has a name, a set of scopes (today: only `QUICK_ADD_VOCAB`), and — when the `QUICK_ADD_VOCAB` scope is selected — a required target `languageFolderId`. The folder determines the language pair (`sourceLanguageCode`/`targetLanguageCode` live on the folder), so there's nothing else to configure.
- The raw key is shown exactly once, at creation time (`vk_...`). It's stored server-side only as a SHA-256 hash — losing it means generating a new key, there's no recovery.
- Deleting a key is a hard delete. There is no separate "revoke" state.
- A key can only be used to call the quick-add endpoint below — it does not act as a general login and cannot reach any other authenticated route.

## API

```
POST /vocabs/quick-add
X-Api-Key: vk_...
Content-Type: application/json

{ "textSource": "serendipity" }
```

- No `sourceLanguageCode`/`targetLanguageCode`/`languageFolderId` in the body — all three come from the API key's configured folder.
- Response: `201 Created` with `{ id, textSource, ... }` (standard `VocabDto`). Translation is not included yet — it fills in asynchronously via the same AI-translation pipeline used by normal vocab creation (`textTargets: []` triggers the queue).
- Errors: `401` (missing/invalid `X-Api-Key`), `403` (key doesn't have the `QUICK_ADD_VOCAB` scope).
- Rate limiting: falls back to the global IP-based throttle (this route is `@Public()`, so the per-user throttle key isn't available) — fine for personal, single-user use.

## iOS Shortcut setup

1. Open the **Shortcuts** app → create a new shortcut.
2. Add action **"Get Contents of URL"**:
    - URL: `https://<your-api-host>/vocabs/quick-add`
    - Method: `POST`
    - Headers: `X-Api-Key` → your key from the API Keys page
    - Request Body: JSON → `{ "textSource": <Shortcut Input> }`
3. Add action **"Show Notification"** using the response's `textSource` field, e.g. "Added “<word>” — translating…".
4. In the shortcut's settings, enable **"Show in Share Sheet"** and set accepted input types to Text.

Now selecting a word anywhere text is selectable → Share → your shortcut name adds it to Vocab.

## Security model

- Keys are scoped (currently to one action: quick-add) — a leaked key can only create low-value vocab entries in one folder, not read or modify anything else.
- Keys are stored hashed (SHA-256), never in plaintext.
- Deleting a key is immediate and irreversible.
