const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./helpers.cjs');

const preferences = {
  gptModel: 'gpt-4o-mini',
  commentContext: '',
  postContext: '',
  requireConfirmation: false
};

test('migrates old credentials out of sync and preserves an explicit false preference', async () => {
  const app = sandbox(['lib/settings.js']);
  await app.chrome.storage.sync.set({
    ...preferences,
    openaiApiKey: 'sk-test'
  });
  await app.initializeSettings();
  assert.equal(app.chrome.storage.session.data.openaiApiKey, 'sk-test');
  assert.equal(app.chrome.storage.local.data.requireConfirmation, false);
  assert.equal(app.chrome.storage.local.data.openaiApiKey, undefined);
  assert.deepEqual(app.chrome.storage.sync.data, {});
});

test('migration is repeatable and keeps more recent local settings and session key', async () => {
  const app = sandbox(['lib/settings.js']);
  await app.chrome.storage.sync.set({ ...preferences, openaiApiKey: 'sk-old' });
  await app.chrome.storage.local.set({ requireConfirmation: true });
  await app.chrome.storage.session.set({ openaiApiKey: 'sk-new' });
  await app.initializeSettings();
  await app.initializeSettings();
  assert.equal(app.chrome.storage.session.data.openaiApiKey, 'sk-new');
  assert.equal(app.chrome.storage.local.data.requireConfirmation, true);
});

test('a failed migration retains the original key for recovery', async () => {
  const app = sandbox(['lib/settings.js']);
  await app.chrome.storage.sync.set({ openaiApiKey: 'sk-old' });
  app.chrome.storage.session.set = async () => {
    throw new Error('storage failure');
  };
  await assert.rejects(app.initializeSettings(), /storage failure/);
  assert.equal(app.chrome.storage.sync.data.openaiApiKey, 'sk-old');
});

test('validates bounded settings and supports explicitly forgetting credentials', async () => {
  const app = sandbox(['lib/settings.js']);
  assert.throws(
    () =>
      app.settingsFrom({ ...preferences, commentContext: 'a'.repeat(4001) }),
    /4,000/
  );
  assert.throws(
    () => app.settingsFrom({ ...preferences, gptModel: 'invented-model' }),
    /supported/
  );
  await assert.rejects(
    app.saveSettings(preferences, 'sk-invalid key'),
    /without spaces/
  );
  await app.saveSettings(preferences, 'sk-test');
  await app.saveSettings(preferences, '');
  assert.equal(app.chrome.storage.session.data.openaiApiKey, '');
});
