const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { root } = require('./helpers.cjs');

// Exercise the real HTML/CSS/JS in Chromium. Chrome APIs are mocked at the
// boundary so this test cannot spend API credits or post to a real account.
async function main() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 400, height: 600 }
    });
    await context.route('https://popup.test/**', (route) => {
      const name =
        new URL(route.request().url()).pathname.slice(1) || 'popup.html';
      if (!['popup.html', 'popup.js', 'popup.css'].includes(name))
        return route.abort();
      return route.fulfill({
        body: fs.readFileSync(path.join(root, name)),
        contentType: name.endsWith('.css')
          ? 'text/css'
          : name.endsWith('.js')
            ? 'application/javascript'
            : 'text/html'
      });
    });
    await context.addInitScript(() => {
      const saved = JSON.parse(localStorage.getItem('mock') || '{}');
      let settings = saved.settings || {
        gptModel: 'gpt-4o-mini',
        commentContext: '',
        postContext: '',
        requireConfirmation: true
      };
      let apiKey = saved.apiKey || '';
      let state = saved.state || { phase: 'idle' };
      const session = saved.session || {};
      const listeners = [];
      const persist = () =>
        localStorage.setItem(
          'mock',
          JSON.stringify({ settings, apiKey, state, session })
        );
      const update = (next) => {
        state = next;
        persist();
        listeners.forEach((listener) =>
          listener({ 'job:7': { newValue: state } }, 'session')
        );
      };
      window.chrome = {
        tabs: {
          query: async () => [
            { id: 7, url: 'https://old.reddit.com/r/test/comments/abc/' }
          ]
        },
        storage: {
          onChanged: { addListener: (listener) => listeners.push(listener) },
          session: {
            get: async (key) => ({ [key]: session[key] }),
            set: async (values) => {
              Object.assign(session, values);
              persist();
            },
            remove: async (key) => {
              delete session[key];
              persist();
            }
          }
        },
        runtime: {
          sendMessage: async (message) => {
            if (
              localStorage.getItem('failInit') &&
              message.action === 'settings'
            )
              throw new Error('Storage unavailable');
            if (message.action === 'settings')
              return { success: true, settings, openaiApiKey: apiKey };
            if (message.action === 'state') return { success: true, state };
            if (message.action === 'save') {
              settings = message.settings;
              apiKey = message.apiKey;
              persist();
              return { success: true };
            }
            if (message.action === 'generate') {
              if (!apiKey)
                return {
                  success: false,
                  error: 'Enter your API key for this browser session.'
                };
              update({ phase: 'generating' });
              await new Promise((resolve) => setTimeout(resolve, 100));
              update({
                phase: 'draft',
                title: 'A test post',
                postId: 't3_abc',
                comment: 'A useful draft.\n\nSecond paragraph.'
              });
            }
            if (message.action === 'submit') {
              update({ ...state, phase: 'posting', comment: message.comment });
              await new Promise((resolve) => setTimeout(resolve, 100));
              update({ ...state, phase: 'posted' });
            }
            if (message.action === 'clear') update({ phase: 'idle' });
            return { success: true, state };
          }
        }
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('https://popup.test/popup.html');
    await page
      .getByRole('button', { name: 'Generate comment', exact: true })
      .waitFor();
    await page.waitForFunction(
      () => !document.getElementById('commentBtn').disabled
    );
    assert.equal(
      await page.locator('#apiKey').getAttribute('type'),
      'password'
    );
    assert.equal(await page.locator('#requireConfirmation').isChecked(), true);
    await page
      .getByRole('button', { name: 'Generate comment', exact: true })
      .click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Enter your API key' })
      .waitFor();
    assert.equal(await page.locator('#commentBtn').isEnabled(), true);
    await page.locator('#apiKey').fill('sk-test');
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    assert.equal(await page.locator('#apiKey').getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await page
      .getByRole('button', { name: 'Generate comment', exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById('postBtn').disabled === false
    );
    await page.locator('#draft').fill('My edited reply.\n\nWith formatting.');
    await page.reload();
    await page.waitForFunction(
      () =>
        document.getElementById('draft').value ===
        'My edited reply.\n\nWith formatting.'
    );
    assert.equal(await page.locator('#postBtn').isEnabled(), true);
    if (process.env.UPDATE_SCREENSHOT === '1') {
      await page.screenshot({
        path: path.join(root, 'assets/1.png'),
        fullPage: true
      });
    }
    await page.locator('summary').click();
    await page.locator('#context').fill('A long context '.repeat(200));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    await page.locator('#draft').focus();
    assert.notEqual(
      await page
        .locator('#draft')
        .evaluate((node) => getComputedStyle(node).outlineStyle),
      'none'
    );
    await page.locator('#postBtn').click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Reddit displayed' })
      .waitFor();
    assert.equal(await page.locator('#postBtn').isEnabled(), false);
    assert.equal(await page.locator('#commentBtn').isEnabled(), false);
    await page.locator('#clearBtn').click();
    await page.waitForFunction(() => document.getElementById('review').hidden);
    await page.locator('#requireConfirmation').uncheck();
    await page.locator('#saveBtn').click();
    await page.reload();
    await page.waitForFunction(
      () => !document.getElementById('saveBtn').disabled
    );
    assert.equal(await page.locator('#requireConfirmation').isChecked(), false);
    await page.evaluate(() => localStorage.setItem('failInit', '1'));
    await page.reload();
    await page
      .getByRole('status')
      .filter({ hasText: 'Unable to initialize' })
      .waitFor();
    assert.equal(await page.locator('#commentBtn').isEnabled(), false);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: popup initialization, key masking, validation recovery, draft editing/reopening, posting, status clearing, preferences, keyboard focus, width, and initialization failure.'
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
