# MCP write tools take a full payload from the client, use ids only, and let the folder fix the language pair

The public MCP (#17) first shipped read-only, with one tool, `list_vocab`. Ticket #26 adds tools that create, change and delete vocab for the signed-in User. The AI client writes the content, so the server must decide how much it trusts that payload, how the client names things, and what a folder means. This ADR records those choices.

## Decision

- **The client sends the full content.** The AI client writes every meaning, grammar note, example and subject. The server does not call its own AI translation for MCP writes. A payload needs at least one meaning. Each meaning needs a non-empty text and at least one subject.
- **Ids, not names.** Folders, subjects and word types are referenced by id. A write never creates a subject, folder or word type as a side effect of a vocab write. The client lists ids first (`list_folders`, `list_subjects`, `list_word_types`) and creates a missing folder or subject with its own tool (`create_folder`, `create_subject`).
- **The folder sets the language pair.** `add_vocab` takes a `folderId`. The server copies the source and target codes from that folder. The client never sends language codes for a vocab.
- **A word moves only within its pair.** `update_vocab` may change the folder only to a folder of the same user with the same source and target codes. Any other folder is refused with `folder_language_mismatch`. The check lives in `VocabService.update`, so the REST update path follows the same rule.
- **Meanings are replaced as a set.** `update_vocab` sends the whole word. It replaces all meanings, as the REST update already does. Related words are not part of the MCP payload.
- **Meaning texts are unique per word.** Two meanings of one word may not have the same text, compared without case. The server refuses this before the database does.
- **Delete is its own scope.** `delete_vocab` needs `vocab:delete`. A word that a trainer still uses is refused with `vocab_in_use`. The tool never removes it from the trainer.
- **Write tools respect the plan.** Quotas use the same service the REST routes use, so the MCP path cannot skip a limit.

## Why

- A full payload is what the client already writes. A second translation step on the server would duplicate the work and could change the user's own words.
- Ids avoid guessing. A name can match two subjects or be typed differently, so the server takes the id the client read from a list.
- The folder decides the pair because a word's codes must match the folder it lives in. If the client could send codes, a word could end up in a folder with a different pair.
- Moves within one pair are safe because the word keeps its meaning. A move across pairs would make every meaning point at the wrong language.
- A separate delete scope lets a user allow writes while still blocking the one action that cannot be undone.

## Consequences

- Each environment needs `vocab:write` and `vocab:delete` added to the MCP API in Auth0 before the code is deployed. Existing connections must reconnect to get consent for them. This follows ADR 0006.
- The consent screen lists three scopes instead of two.
- The REST update path now moves a word when `languageFolderId` changes. Before this change the field was silently ignored, so a REST client that sent it saw no effect. A folder with another pair now returns 400, and a folder the user does not own returns 404.
- `create_folder` checks for a duplicate name and pair in code. The database has no unique rule for folders, so a race between two requests could still create two.
- The rule that a link between two words follows the language pair, not the folder, is decided here and implemented separately. Until that change is merged, a related-word link is still limited to one folder.
- Adding or renaming a tool changes the public contract that clients rely on. Treat it with the same care as a REST API change.
