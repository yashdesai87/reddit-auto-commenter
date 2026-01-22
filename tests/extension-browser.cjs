const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { root } = require('./helpers.cjs');

async function main() {
  // A temporary profile isolates the test from the user's installed extensions,
  // accounts, API keys, and browsing history. Playwright removes it on close.
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
  });
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const redditUrl = 'https://old.reddit.com/r/test/comments/abc/title/';
    await context.route('https://old.reddit.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><body>
        <div id="header-bottom-right"><span class="user"><a>tester</a></span></div>
        <div class="thing link" data-fullname="t3_abc"><a class="title">A fixture post</a><div class="expando"><div class="usertext-body">Test body</div></div></div>
        <div class="commentarea"><form class="usertext"><input name="thing_id" value="t3_abc"><textarea name="text"></textarea><button type="submit">Save</button></form></div>
        <script>
          window.submissions = 0;
          document.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            window.submissions++;
            const node = document.createElement('div');
            node.className = 'thing comment';
            node.dataset.fullname = 't1_new';
            node.innerHTML = '<div class="entry"><a class="author">tester</a><div class="usertext-body"></div></div>';
            node.querySelector('.usertext-body').textContent = document.querySelector('textarea').value;
            document.querySelector('textarea').value = '';
            document.querySelector('.commentarea').append(node);
          });
        </script></body></html>`
      })
    );
    const reddit = await context.newPage();
    await reddit.goto(redditUrl);
    const tabId = await worker.evaluate(
      async (url) => (await chrome.tabs.query({ url }))[0].id,
      redditUrl
    );
    // Only the paid network boundary is substituted. Storage, service worker,
    // runtime messaging, script injection, and page DOM run in the extension.
    await worker.evaluate(() => {
      globalThis.fetch = async () =>
        new Promise((resolve) => {
          globalThis.finishTestGeneration = () =>
            resolve({
              ok: true,
              json: async () => ({
                choices: [
                  {
                    finish_reason: 'stop',
                    message: { content: 'Generated from the worker.' }
                  }
                ]
              })
            });
        });
    });
    const openPopup = async () => {
      const page = await context.newPage();
      // A popup opened as a test tab otherwise reports itself as the active tab.
      await page.addInitScript((id) => {
        chrome.tabs.query = async () => [{ id }];
      }, tabId);
      await page.goto('chrome-extension://' + extensionId + '/popup.html');
      await page.waitForFunction(
        () => !document.getElementById('saveBtn').disabled
      );
      return page;
    };
    let popup = await openPopup();
    await popup.locator('#apiKey').fill('sk-test');
    await popup.locator('#commentBtn').click();
    await popup
      .getByRole('status')
      .filter({ hasText: 'Generating your draft' })
      .waitFor();
    // Closing the UI during generation must not lose the eventual response.
    await popup.close();
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await worker.evaluate(() => Boolean(globalThis.finishTestGeneration)))
        break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await worker.evaluate(() => globalThis.finishTestGeneration());
    popup = await openPopup();
    await popup.waitForFunction(
      () => document.getElementById('postBtn').disabled === false
    );
    await popup.locator('#draft').fill('Edited in the actual extension.');
    await popup.locator('#postBtn').click();
    await popup
      .getByRole('status')
      .filter({ hasText: 'Reddit displayed your new comment' })
      .waitFor();
    assert.equal(await reddit.evaluate(() => window.submissions), 1);
    assert.equal(
      await reddit.locator('.thing.comment .usertext-body').textContent(),
      'Edited in the actual extension.'
    );
    assert.equal(await popup.locator('#postBtn').isEnabled(), false);
    assert.equal(
      await worker.evaluate(
        async () => (await chrome.storage.sync.get('openaiApiKey')).openaiApiKey
      ),
      undefined
    );
    console.log(
      'PASS: installed extension loads, persists generation after popup closes, restores draft, submits once, confirms Reddit DOM, and keeps credentials out of sync.'
    );
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
