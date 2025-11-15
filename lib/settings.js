'use strict';

const DEFAULTS = {
  gptModel: 'gpt-4o-mini',
  commentContext: '',
  postContext: '',
  requireConfirmation: true
};
const MODELS = new Set([
  'gpt-3.5-turbo',
  'gpt-4',
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-4-turbo',
  'gpt-4o-mini',
  'gpt-4o'
]);

async function initializeSettings() {
  // Preferences belong on this device; credentials belong only in session
  // memory. Sync storage is not a secrets vault and can copy keys to devices.
  await chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS'
  });
  await chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const old = await chrome.storage.sync.get([
    'openaiApiKey',
    ...Object.keys(DEFAULTS)
  ]);
  const local = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const preferences = Object.fromEntries(
    Object.keys(DEFAULTS).map((key) => [
      key,
      local[key] ?? old[key] ?? DEFAULTS[key]
    ])
  );
  await chrome.storage.local.set(preferences);
  const session = await chrome.storage.session.get('openaiApiKey');
  if (!session.openaiApiKey && old.openaiApiKey) {
    await chrome.storage.session.set({ openaiApiKey: old.openaiApiKey });
  }
  // Remove the old copy only after all migration writes succeed.
  await chrome.storage.sync.remove(['openaiApiKey', ...Object.keys(DEFAULTS)]);
}

function settingsFrom(input) {
  if (!input || !MODELS.has(input.gptModel))
    throw new Error('Select a supported model.');
  for (const field of ['commentContext', 'postContext']) {
    if (typeof input[field] !== 'string' || input[field].length > 4000) {
      throw new Error('Each context field must be at most 4,000 characters.');
    }
  }
  if (typeof input.requireConfirmation !== 'boolean')
    throw new Error('Invalid confirmation preference.');
  return Object.fromEntries(
    Object.keys(DEFAULTS).map((key) => [key, input[key]])
  );
}

async function readSettings() {
  return {
    settings: {
      ...DEFAULTS,
      ...(await chrome.storage.local.get(Object.keys(DEFAULTS)))
    },
    ...(await chrome.storage.session.get('openaiApiKey'))
  };
}

async function saveSettings(settings, apiKey) {
  const preferences = settingsFrom(settings);
  if (
    typeof apiKey !== 'string' ||
    apiKey.length > 512 ||
    /\s/.test(apiKey) ||
    (apiKey && !apiKey.startsWith('sk-'))
  ) {
    throw new Error('Enter a valid API key without spaces.');
  }
  await chrome.storage.local.set(preferences);
  // An empty value deliberately clears the key without erasing preferences.
  await chrome.storage.session.set({ openaiApiKey: apiKey });
}
