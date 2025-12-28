const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { root } = require('./helpers.cjs');
const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');

function fixture() {
  const dom = new JSDOM(
    `
    <div id="header-bottom-right"><span class="user"><a>tester</a></span></div>
    <div class="thing link" data-fullname="t3_abc"><a class="title">Post title</a></div>
    <div class="commentarea">
      <div class="thing comment" data-fullname="t1_old"><div class="entry">
        <a class="author">other-user</a><div class="usertext-body">Unrelated comment</div>
        <form class="usertext"><input name="thing_id" value="t1_old"><textarea name="text"></textarea><button type="submit">Reply</button></form>
      </div></div>
      <form class="usertext" id="main-form"><input name="thing_id" value="t3_abc"><textarea name="text"></textarea><button type="submit">Save</button><span class="error" hidden></span></form>
    </div>`,
    {
      url: 'https://old.reddit.com/r/test/comments/abc/title/',
      runScripts: 'outside-only'
    }
  );
  const listeners = [];
  dom.window.chrome = {
    runtime: {
      id: 'test',
      onMessage: { addListener: (fn) => listeners.push(fn) }
    }
  };
  // jsdom does not perform layout. Only visibility is substituted; selectors,
  // forms, events, and mutation observers use its actual DOM implementation.
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return this.hidden ? [] : [{}];
  };
  dom.window.eval(source);
  const send = (message) =>
    new Promise((resolve) => listeners[0](message, { id: 'test' }, resolve));
  return { dom, listeners, send, document: dom.window.document };
}

test('link-post extraction never borrows the body of a comment', async (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  const result = await f.send({ action: 'extract', postId: 't3_abc' });
  assert.equal(result.success, true);
  assert.equal(result.body, '');
  assert.equal(result.title, 'Post title');
});

test('reads selftext only from the selected post', async (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  f.document
    .querySelector('.thing.link')
    .insertAdjacentHTML(
      'beforeend',
      '<div class="expando"><div class="usertext-body">Actual body</div></div>'
    );
  assert.equal(
    (await f.send({ action: 'extract', postId: 't3_abc' })).body,
    'Actual body'
  );
});

test('rejects navigation, logged-out users, and disabled posting forms before generation', async (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  assert.equal(
    (await f.send({ action: 'extract', postId: 't3_other' })).success,
    false
  );
  f.document.querySelector('#main-form button').disabled = true;
  assert.match(
    (await f.send({ action: 'extract', postId: 't3_abc' })).error,
    /unavailable/
  );
  f.document.querySelector('#main-form button').disabled = false;
  f.document.querySelector('#header-bottom-right .user').remove();
  assert.match(
    (await f.send({ action: 'extract', postId: 't3_abc' })).error,
    /Log into Reddit/
  );
});

test('preserves an existing user draft during both extraction and submission', async (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  const textarea = f.document.querySelector('#main-form textarea');
  textarea.value = 'My unfinished reply';
  assert.equal(
    (await f.send({ action: 'extract', postId: 't3_abc' })).success,
    false
  );
  assert.equal(
    (await f.send({ action: 'submit', postId: 't3_abc', comment: 'Generated' }))
      .success,
    false
  );
  assert.equal(textarea.value, 'My unfinished reply');
});

test('submits only the top-level form and waits for a newly displayed own comment', async (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  let clicks = 0;
  f.document
    .querySelector('#main-form button')
    .addEventListener('click', (event) => {
      event.preventDefault();
      clicks++;
      f.document.querySelector('#main-form textarea').value = '';
      f.document
        .querySelector('.commentarea')
        .insertAdjacentHTML(
          'beforeend',
          '<div class="thing comment" data-fullname="t1_new"><div class="entry"><a class="author">tester</a></div></div>'
        );
    });
  const response = await f.send({
    action: 'submit',
    postId: 't3_abc',
    comment: 'My comment'
  });
  assert.equal(response.success, true);
  assert.equal(response.commentId, 't1_new');
  assert.equal(clicks, 1);
  assert.equal(f.document.querySelector('.thing.comment textarea').value, '');
});

test('reports Reddit errors without refreshing or falsely claiming success', async (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  f.document
    .querySelector('#main-form button')
    .addEventListener('click', (event) => {
      event.preventDefault();
      const error = f.document.querySelector('.error');
      error.hidden = false;
      error.textContent = 'You are doing that too much';
    });
  const response = await f.send({
    action: 'submit',
    postId: 't3_abc',
    comment: 'My comment'
  });
  assert.equal(response.success, false);
  assert.match(response.error, /too much/);
  assert.equal(
    f.document.querySelector('#main-form textarea').value,
    'My comment'
  );
});

test('a click without confirmation times out and a duplicate request cannot click twice', async (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  let deadline;
  f.dom.window.setTimeout = (callback) => {
    deadline = callback;
    return 1;
  };
  let clicks = 0;
  f.document
    .querySelector('#main-form button')
    .addEventListener('click', (event) => {
      event.preventDefault();
      clicks++;
    });
  const first = f.send({
    action: 'submit',
    postId: 't3_abc',
    comment: 'My comment'
  });
  await Promise.resolve();
  const duplicate = await f.send({
    action: 'submit',
    postId: 't3_abc',
    comment: 'My comment'
  });
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /in progress/);
  deadline();
  assert.match((await first).error, /not confirmed/);
  assert.equal(clicks, 1);
});

test('repeated injection registers only one listener and rejects untrusted messages', (t) => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  f.dom.window.eval(source);
  assert.equal(f.listeners.length, 1);
  assert.equal(
    f.listeners[0]({ action: 'submit' }, { id: 'other' }, () => {}),
    false
  );
  assert.equal(
    f.listeners[0]({ action: 'unknown' }, { id: 'test' }, () => {}),
    false
  );
});
