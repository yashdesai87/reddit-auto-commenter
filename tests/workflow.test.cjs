const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./helpers.cjs');
const sender = { id: 'test', url: 'chrome-extension://test/popup.html' };

async function appFixture() {
  const app = sandbox(['background.js'], {
    fetch: async () => ({
      ok: true,
      json: async () => ({
        choices: [
          { finish_reason: 'stop', message: { content: 'Useful reply' } }
        ]
      })
    })
  });
  const mutations = [];
  let url = 'https://old.reddit.com/r/test/comments/abc/title/';
  app.chrome.tabs = {
    ...app.chrome.tabs,
    get: async () => ({ id: 7, url }),
    sendMessage: async (tabId, message) => {
      if (message.action === 'ping') return { success: true };
      if (message.action === 'extract')
        return { success: true, title: 'Title', body: 'Body' };
      mutations.push(message);
      return { success: true, commentId: 't1_new' };
    }
  };
  app.chrome.scripting = { executeScript: async () => {} };
  await app.handle({ action: 'settings' }, sender);
  await app.chrome.storage.session.set({ openaiApiKey: 'sk-test' });
  const request = (action, values = {}) =>
    app.handle({ action, tabId: 7, ...values }, sender);
  return {
    app,
    request,
    mutations,
    navigate: (value) => {
      url = value;
    }
  };
}

test('default flow generates a persistent draft and only posts after explicit approval', async () => {
  const f = await appFixture();
  assert.equal((await f.request('generate')).state.phase, 'draft');
  assert.equal(f.mutations.length, 0);
  assert.equal((await f.request('state')).state.comment, 'Useful reply');
  assert.equal(
    (await f.request('submit', { comment: 'Edited reply' })).state.phase,
    'posted'
  );
  assert.equal(f.mutations[0].comment, 'Edited reply');
  await assert.rejects(
    f.request('submit', { comment: 'Duplicate' }),
    /Generate a draft/
  );
  await assert.rejects(f.request('generate'), /previous submission/);
});

test('explicit automatic mode submits from the worker', async () => {
  const f = await appFixture();
  await f.app.chrome.storage.local.set({ requireConfirmation: false });
  assert.equal((await f.request('generate')).state.phase, 'posted');
  assert.equal(f.mutations.length, 1);
});

test('navigation invalidates the draft before any submission message is sent', async () => {
  const f = await appFixture();
  await f.request('generate');
  f.navigate('https://old.reddit.com/r/test/comments/xyz/another/');
  await assert.rejects(
    f.request('submit', { comment: 'Reply' }),
    /changed posts/
  );
  assert.equal(f.mutations.length, 0);
});

test('validates exact HTTPS host and individual post route', async () => {
  const f = await appFixture();
  for (const url of [
    'https://evil.test/?old.reddit.com',
    'https://old.reddit.com.evil.test/r/x/comments/abc/',
    'http://old.reddit.com/r/x/comments/abc/',
    'https://old.reddit.com/r/test/'
  ]) {
    f.navigate(url);
    await assert.rejects(f.request('generate'), /specific post/);
  }
});

test('a lost submission response is never automatically retried', async () => {
  const f = await appFixture();
  await f.request('generate');
  let count = 0;
  f.app.chrome.tabs.sendMessage = async (id, message) => {
    if (message.action === 'ping') return { success: true };
    count++;
    throw new Error('Message port closed');
  };
  assert.equal(
    (await f.request('submit', { comment: 'Reply' })).state.phase,
    'uncertain'
  );
  assert.equal(count, 1);
  await assert.rejects(f.request('generate'), /previous submission/);
});

test('an interrupted worker preserves uncertain submissions instead of replaying them', async () => {
  const f = await appFixture();
  await f.app.chrome.storage.session.set({
    'job:7': { phase: 'posting', postId: 't3_abc', comment: 'Reply' }
  });
  assert.equal((await f.request('state')).state.phase, 'uncertain');
  await assert.rejects(f.request('generate'), /previous submission/);
  assert.equal(f.mutations.length, 0);
});

test('simultaneous generation requests spend only one API call', async () => {
  const f = await appFixture();
  let release;
  const started = new Promise((resolve) => {
    release = resolve;
  });
  let finish;
  f.app.fetch = async () => {
    release();
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = f.request('generate');
  await started;
  await assert.rejects(f.request('generate'), /already running/);
  finish({
    ok: true,
    json: async () => ({
      choices: [{ finish_reason: 'stop', message: { content: 'Reply' } }]
    })
  });
  assert.equal((await first).state.phase, 'draft');
});

test('rejects content-script attempts to access settings or start generation', async () => {
  const f = await appFixture();
  await assert.rejects(
    f.app.handle(
      { action: 'settings' },
      { id: 'test', url: 'https://old.reddit.com/' }
    ),
    /Untrusted/
  );
});

test('closing a tab removes drafts and does not restore them when generation finishes', async () => {
  const f = await appFixture();
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  let finish;
  f.app.fetch = async () => {
    markStarted();
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const pending = f.request('generate');
  await started;
  await f.app.chrome.storage.session.set({ 'edit:7': { text: 'Old edit' } });
  f.app.chrome.tabs.onRemoved.listener(7);
  finish({
    ok: true,
    json: async () => ({
      choices: [{ finish_reason: 'stop', message: { content: 'Reply' } }]
    })
  });
  await pending;
  assert.equal(f.app.chrome.storage.session.data['job:7'], undefined);
  assert.equal(f.app.chrome.storage.session.data['edit:7'], undefined);
});
