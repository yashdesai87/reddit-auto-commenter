'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const byId = (id) => document.getElementById(id);
  let tabId;
  let busy = false;
  let phase = 'idle';
  let renderedDraft;
  let ready = false;
  let hasLocalEdits = false;
  let stateRevision = 0;

  function showStatus(message, type = 'info') {
    const status = byId('status');
    status.textContent = message;
    status.className = 'status ' + type;
  }

  async function request(action, values = {}) {
    const result = await chrome.runtime.sendMessage({
      action,
      tabId,
      ...values
    });
    if (!result?.success)
      throw new Error(
        result?.error ||
          'The extension did not respond. Reopen the popup and try again.'
      );
    return result;
  }

  function updateControls() {
    const running = busy || ['generating', 'posting'].includes(phase);
    byId('settingsFields').disabled = running || !ready;
    byId('saveBtn').disabled = running || !ready;
    byId('commentBtn').disabled =
      running || !ready || ['posted', 'uncertain'].includes(phase);
    byId('postBtn').disabled =
      running || !ready || phase !== 'draft' || !byId('draft').value.trim();
    byId('clearBtn').disabled = running || !ready;
    byId('draft').disabled = running || phase !== 'draft';
    byId('commentBtn').textContent =
      phase === 'generating' ? 'Generating…' : 'Generate comment';
    byId('postBtn').textContent =
      phase === 'posting' ? 'Posting…' : 'Post comment';
    byId('status').setAttribute('aria-busy', String(running));
  }

  function updateCount() {
    byId('draftCount').textContent =
      byId('draft').value.length.toLocaleString() + ' / 10,000';
    updateControls();
  }

  function render(state) {
    phase = state.phase;
    byId('review').hidden = !state.comment;
    byId('draftTitle').textContent = state.title || 'Generated comment';
    // Storage progress events must not replace edits made in the open popup.
    if (state.comment && state.comment !== renderedDraft && !hasLocalEdits) {
      byId('draft').value = state.comment;
      renderedDraft = state.comment;
    }
    const labels = {
      idle: 'Open a post on old.reddit.com to get started.',
      generating:
        'Generating your draft. You can reopen this popup to check progress.',
      draft: 'Review and edit the draft, then click Post comment.',
      posting: 'Waiting for Reddit to confirm submission…',
      posted: 'Reddit displayed your new comment.',
      uncertain:
        'Submission status is uncertain. Check Reddit before trying again.',
      error: 'Generation failed.'
    };
    showStatus(
      state.error || labels[phase] || 'Unknown operation state.',
      ['uncertain', 'error'].includes(phase)
        ? 'error'
        : phase === 'posted'
          ? 'success'
          : 'info'
    );
    updateCount();
  }

  async function save() {
    return request('save', {
      apiKey: byId('apiKey').value.trim(),
      settings: {
        gptModel: byId('gptModel').value,
        commentContext: byId('context').value.trim(),
        postContext: byId('postContext').value.trim(),
        requireConfirmation: byId('requireConfirmation').checked
      }
    });
  }

  async function run(work) {
    if (busy || !ready) return;
    busy = true;
    updateControls();
    try {
      await work();
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      busy = false;
      updateControls();
    }
  }

  byId('showKey').addEventListener('click', () => {
    const show = byId('apiKey').type === 'password';
    byId('apiKey').type = show ? 'text' : 'password';
    byId('showKey').textContent = show ? 'Hide' : 'Show';
    byId('showKey').setAttribute('aria-pressed', String(show));
  });
  byId('draft').addEventListener('input', () => {
    hasLocalEdits = true;
    updateCount();
    // Save edits independently of workflow state. An in-flight generation or
    // progress notification must not overwrite the user's current text.
    chrome.storage.session
      .set({
        ['edit:' + tabId]: {
          original: renderedDraft,
          text: byId('draft').value
        }
      })
      .catch(() =>
        showStatus(
          'Could not save your edits. Copy the draft before closing.',
          'error'
        )
      );
  });

  try {
    updateControls();
    showStatus('Loading settings…');
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!tab || !Number.isInteger(tab.id))
      throw new Error('No active tab is available.');
    tabId = tab.id;
    const { settings, openaiApiKey } = await request('settings');
    byId('apiKey').value = openaiApiKey || '';
    byId('gptModel').value = settings.gptModel;
    if (!byId('gptModel').value) byId('gptModel').value = 'gpt-4o-mini';
    byId('context').value = settings.commentContext;
    byId('postContext').value = settings.postContext;
    byId('requireConfirmation').checked = settings.requireConfirmation;

    // Subscribe before the first state read so generation finishing while the
    // popup opens does not leave the UI stuck on an old progress snapshot.
    chrome.storage.onChanged.addListener((changes, area) => {
      const state = changes['job:' + tabId]?.newValue;
      if (area === 'session' && state) {
        stateRevision++;
        render(state);
      }
    });
    const revisionAtRead = stateRevision;
    const initialState = (await request('state')).state;
    if (stateRevision === revisionAtRead) render(initialState);
    const edit = (await chrome.storage.session.get('edit:' + tabId))[
      'edit:' + tabId
    ];
    if (phase === 'draft' && edit?.original === renderedDraft) {
      byId('draft').value = edit.text;
      hasLocalEdits = true;
      updateCount();
    }

    byId('saveBtn').addEventListener('click', () =>
      run(async () => {
        await save();
        showStatus(
          'Settings saved. The API key is kept for this browser session only.',
          'success'
        );
      })
    );
    byId('commentBtn').addEventListener('click', () =>
      run(async () => {
        await save();
        if (
          phase === 'draft' &&
          !confirm('Replace the current draft with a newly generated comment?')
        )
          return;
        hasLocalEdits = false;
        renderedDraft = undefined;
        await chrome.storage.session.remove('edit:' + tabId);
        render({ phase: 'generating' });
        try {
          render((await request('generate')).state);
        } catch (error) {
          render((await request('state')).state);
          throw error;
        }
      })
    );
    byId('postBtn').addEventListener('click', () =>
      run(async () => {
        hasLocalEdits = false;
        render(
          (await request('submit', { comment: byId('draft').value })).state
        );
      })
    );
    byId('clearBtn').addEventListener('click', () =>
      run(async () => {
        if (
          ['uncertain', 'posted'].includes(phase) &&
          !confirm(
            'Have you checked Reddit for the previous comment? Clearing this status allows another submission.'
          )
        )
          return;
        if (phase === 'draft' && !confirm('Discard this generated draft?'))
          return;
        renderedDraft = undefined;
        hasLocalEdits = false;
        await chrome.storage.session.remove('edit:' + tabId);
        byId('draft').value = '';
        render((await request('clear')).state);
      })
    );
    ready = true;
    updateControls();
  } catch (error) {
    ready = false;
    showStatus('Unable to initialize: ' + error.message, 'error');
    updateControls();
  }
});
