'use strict';

importScripts('lib/settings.js', 'lib/generator.js');

const jobs = new Set();
const closedTabs = new Set();
const stateKey = (tabId) => 'job:' + tabId;
const ready = initializeSettings();
// Surface initialization failures through popup requests.
ready.catch(() => {});

function postId(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(
    /^\/r\/[^/]+\/comments\/([a-z0-9]+)(?:\/|$)/i
  );
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'old.reddit.com' ||
    !match
  ) {
    throw new Error('Open a specific post on https://old.reddit.com first.');
  }
  return 't3_' + match[1].toLowerCase();
}

async function getState(tabId) {
  const state = (await chrome.storage.session.get(stateKey(tabId)))[
    stateKey(tabId)
  ] || { phase: 'idle' };
  // Restarting the worker must not replay a submission; its response may have
  // been lost after Reddit accepted it. Preserve the draft for manual recovery.
  if (['generating', 'posting'].includes(state.phase) && !jobs.has(tabId)) {
    state.phase = state.phase === 'posting' ? 'uncertain' : 'error';
    state.error =
      'The operation was interrupted. Check Reddit before trying again.';
    await setState(tabId, state);
  }
  return state;
}

async function setState(tabId, state) {
  if (closedTabs.has(tabId)) return state;
  await chrome.storage.session.set({ [stateKey(tabId)]: state });
  return state;
}

async function pageMessage(tabId, message) {
  let ping;
  try {
    ping = await chrome.tabs.sendMessage(
      tabId,
      { action: 'ping' },
      { frameId: 0 }
    );
  } catch (_) {
    /* An existing tab may predate installation. */
  }
  if (!ping?.success)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  // Never retry a mutation: a missing response does not establish non-delivery.
  const result = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  if (!result?.success)
    throw new Error(
      result?.error ||
        'The Reddit page did not respond. Refresh it and try again.'
    );
  return result;
}

async function submit(tabId, state, comment) {
  if (typeof comment !== 'string' || !comment.trim() || comment.length > 10000)
    throw new Error('Enter a comment between 1 and 10,000 characters.');
  const tab = await chrome.tabs.get(tabId);
  if (postId(tab.url) !== state.postId)
    throw new Error(
      'The tab changed posts. Generate a new comment on the current post.'
    );
  const posting = {
    ...state,
    phase: 'posting',
    comment: comment.trim(),
    error: ''
  };
  await setState(tabId, posting);
  try {
    const result = await pageMessage(tabId, {
      action: 'submit',
      postId: state.postId,
      comment: posting.comment
    });
    return await setState(tabId, {
      ...posting,
      phase: 'posted',
      commentId: result.commentId
    });
  } catch (error) {
    return setState(tabId, {
      ...posting,
      phase: 'uncertain',
      error: error.message + ' Check Reddit before starting another attempt.'
    });
  }
}

async function generate(tabId) {
  const previous = await getState(tabId);
  if (['posting', 'uncertain', 'posted'].includes(previous.phase))
    throw new Error(
      'Check the previous submission on Reddit, then clear its status before generating again.'
    );
  const tab = await chrome.tabs.get(tabId);
  const expectedId = postId(tab.url);
  const settings = settingsFrom({
    ...DEFAULTS,
    ...(await chrome.storage.local.get(Object.keys(DEFAULTS)))
  });
  const { openaiApiKey } = await chrome.storage.session.get('openaiApiKey');
  if (!openaiApiKey)
    throw new Error('Enter your API key for this browser session.');
  await setState(tabId, { phase: 'generating', postId: expectedId });
  try {
    const post = await pageMessage(tabId, {
      action: 'extract',
      postId: expectedId
    });
    const comment = await generateComment(post, settings, openaiApiKey);
    const state = {
      phase: 'draft',
      postId: expectedId,
      title: post.title,
      comment
    };
    await setState(tabId, state);
    return settings.requireConfirmation
      ? state
      : await submit(tabId, state, comment);
  } catch (error) {
    return setState(tabId, {
      phase: 'error',
      postId: expectedId,
      error: error.message
    });
  }
}

async function handle(request, sender) {
  // Only the packaged popup can initiate operations or retrieve credentials.
  // Page scripts cannot use the worker as an unrestricted API proxy.
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL('popup.html')
  )
    throw new Error('Untrusted request.');
  await ready;
  if (request?.action === 'settings') return readSettings();
  if (request?.action === 'save') {
    await saveSettings(request.settings, request.apiKey);
    return {};
  }
  if (!Number.isInteger(request?.tabId) || request.tabId < 0)
    throw new Error('No active tab is available.');
  const tabId = request.tabId;
  if (request.action === 'state') return { state: await getState(tabId) };
  if (jobs.has(tabId))
    throw new Error('An operation is already running for this tab.');
  // Recover stale worker state before acquiring a new lock. Recheck after the
  // await so concurrent requests cannot both acquire it.
  await getState(tabId);
  if (jobs.has(tabId))
    throw new Error('An operation is already running for this tab.');
  jobs.add(tabId);
  try {
    if (request.action === 'generate') return { state: await generate(tabId) };
    if (request.action === 'submit') {
      const state = await getState(tabId);
      if (state.phase !== 'draft')
        throw new Error('Generate a draft before posting.');
      return { state: await submit(tabId, state, request.comment) };
    }
    if (request.action === 'clear')
      return { state: await setState(tabId, { phase: 'idle' }) };
    throw new Error('Unknown action.');
  } finally {
    jobs.delete(tabId);
    if (closedTabs.delete(tabId)) {
      await chrome.storage.session.remove([stateKey(tabId), 'edit:' + tabId]);
    }
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handle(request, sender)
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Closing a tab retires its session data. A pending API response must not
  // recreate an orphaned draft after the first cleanup has completed.
  if (jobs.has(tabId)) closedTabs.add(tabId);
  chrome.storage.session
    .remove([stateKey(tabId), 'edit:' + tabId])
    .catch(() => {});
});
