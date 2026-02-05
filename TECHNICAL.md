# Technical guide

## Layout

| File                      | Responsibility                                                               |
| ------------------------- | ---------------------------------------------------------------------------- |
| `manifest.json`           | Manifest V3 permissions, popup, content script, and worker                   |
| `background.js`           | Trusted popup requests, per-tab job locks, state transitions, page messaging |
| `lib/settings.js`         | Settings validation, session credentials, migration from legacy sync storage |
| `lib/generator.js`        | Prompt construction, bounded API requests, response validation               |
| `content.js`              | Post-scoped extraction, draft protection, submission and DOM confirmation    |
| `popup.html`, `popup.css` | Accessible popup structure and visual presentation                           |
| `popup.js`                | Settings UI, editable draft, progress/error display, session edit recovery   |
| `tests/`                  | Regression tests and Chromium browser checks                                 |

Production has no third-party JavaScript dependencies or build step.
Development dependencies are locked in `package-lock.json`.

## Workflow and ownership

The worker owns generation and posting. The popup is a view/controller; closing it
does not discard a generated response or stop an already-started operation.

```text
idle → generating → draft → posting → posted
          ↓                     ↓
        error                uncertain
```

With explicit automatic mode, the worker advances from draft to posting without
waiting for review. The default requires a separate Post comment action.

Jobs are scoped to a tab ID and bound to a Reddit post ID. A tab may have only one
active operation. Both the worker and the content script verify the destination
before posting. Navigating to a different post invalidates the existing draft.

State lives in session storage at `job:<tabId>`. Popup edits are saved separately at
`edit:<tabId>` with the original generated text, so progress updates cannot replace
the text being edited. Browser restart or extension reload clears session data.

An interrupted generation becomes an error when the popup reconnects. An
interrupted submission becomes uncertain. The extension does not replay it:
a lost response might mean Reddit accepted the comment.

## Reddit interaction

The content script accepts only known messages from this extension. Repeated
injection is guarded so one document has one listener.

Extraction requires:

- An HTTPS old Reddit URL with an individual post route.
- The post element with the matching `data-fullname`.
- A logged-in user indicator.
- An available top-level comment form whose hidden `thing_id` matches the post.
- An empty, visible, enabled textarea and an available submit button.

Title and selftext are extracted within the selected post. Link posts without
selftext yield an empty body; the first comment is never substituted.

Submission revalidates the page and form. It fills only the post's top-level form,
dispatches input/change events, and clicks its submit button once. A mutation
observer waits for a new top-level comment by the logged-in user and for the form
to clear. Visible Reddit form errors are returned to the popup.

There is no forced reload and no success message based solely on clicking Submit.
If confirmation cannot be established within 20 seconds, the state is uncertain.
Check the page before clearing the status to allow another attempt.

This relies on Reddit's DOM conventions, not a server-side posting receipt.
A markup change or simultaneous manual action can affect confirmation. Treat an
uncertain result as potentially submitted.

## Generation

The generator uses Chat Completions with the configured model, a 500-token output
limit, and a temperature of 0.7. The model picker is a configured list, not a live
catalog or a guarantee of access.

Post material is serialized separately from system instructions. The prompt asks
the model to treat it as untrusted material and avoid inventing personal
experiences. This is a prompt-level mitigation, not a guarantee of factual or
safe output; user review remains important.

Validation rejects:

- Missing or oversized post data.
- Missing, null, non-text, empty, or oversized output.
- Refusals and responses that did not finish normally, including truncation.
- Invalid JSON and non-successful HTTP responses.

The request has a 25-second abort deadline, including response parsing. Status
codes produce actionable errors without echoing provider response bodies.
There is no automatic API retry. Markdown, paragraph breaks, and Unicode
punctuation are preserved.

## Storage and trust

Preferences use local storage. Credentials use session storage and are exposed
only to trusted extension contexts. The popup masks the key by default and
supports clearing it explicitly.

Migration reads legacy sync settings, preserves newer local preferences, moves a
legacy key into session memory if needed, and removes the old synchronized
values only after successful writes. Initialization failure blocks UI actions
and presents an error.

The worker accepts commands only from the packaged `popup.html` URL with this
extension's ID. It does not accept content-script requests to retrieve credentials
or invoke the API. Page messages target frame zero. Recovery injection is used
when the page does not respond to a ping; posting itself is never retried.

Storage APIs are not a password vault. Session storage reduces persistence and
unnecessary syncing; it does not protect against a compromised browser or device.
Chrome documents the storage scopes and access controls in its
[storage reference](https://developer.chrome.com/docs/extensions/reference/api/storage).

## Popup behavior

- Settings remain disabled until initialization succeeds.
- Progress disables conflicting actions and announces status through an ARIA live region.
- Review mode is enabled by default; an explicit saved false value is respected.
- Generated text is editable before posting, with a character count.
- Draft edits are saved in session storage and restored when reopening the popup.
- Error and success messages remain visible instead of disappearing on a timer.
- Unknown submission outcomes block another generation until status is explicitly cleared.
- Clearing an existing draft or submission status asks for confirmation.
- Inputs have labels, visible keyboard focus, bounded lengths, and predictable disabled states.
- The popup scrolls vertically and avoids horizontal overflow at its 400-pixel width.

Chrome closes a toolbar popup when focus moves away. The worker-owned workflow
accounts for this behavior. See Chrome's
[popup guide](https://developer.chrome.com/docs/extensions/develop/ui/add-popup).

## Verification

`npm test` runs unit and DOM regression tests for settings migration, generation
validation, timing failures, duplicate prevention, post binding, and form selection.

`npm run test:ui` loads the real popup assets in Chromium with simulated Chrome APIs.
It checks initialization, validation recovery, key visibility, editing/reopening,
submission states, clearing, persisted preferences, keyboard focus, and overflow.

`npm run test:extension` loads the unpacked extension in an isolated Chromium
profile. It uses actual Chrome storage, runtime messaging, worker execution, and
content scripts against a simulated Reddit page. Only API generation and the
test-tab selection are substituted. It closes the popup during generation,
reopens it, edits the result, and verifies exactly one submission.

To update the screenshot intentionally:

```bash
UPDATE_SCREENSHOT=1 npm run test:ui
```

Browser profiles used by these tests are temporary. No real Reddit login, public
submission, or paid OpenAI request is used.

## Manual verification before a release

Use your own account and a post where you have permission to comment:

1. Load the extension and verify its popup at normal and enlarged browser zoom.
2. Check a selftext post, a link post, a comment permalink, and a post with collapsed content.
3. Verify logged-out, locked, archived, and restricted-post handling.
4. Try generation with a valid key, rejected key, unavailable model, and exhausted quota.
5. Close/reopen the popup during generation; verify the draft and edits survive.
6. Navigate the original tab to another post before approving; verify submission is blocked.
7. Put text in Reddit's form before generation and before approval; verify it is preserved.
8. Submit one reviewed comment and inspect the actual result on Reddit.
9. Test a Reddit rate-limit rejection and slow/lost network response; verify there is no automatic resubmission.
10. Restart Chrome and verify preferences remain while the API key and drafts clear.

Automated fixtures cannot establish compatibility with every live subreddit,
account restriction, DOM variant, browser version, or future API response.
