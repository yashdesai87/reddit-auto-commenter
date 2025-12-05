const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./helpers.cjs');
const settings = {
  gptModel: 'gpt-4o-mini',
  commentContext: '',
  postContext: ''
};
const post = { title: 'A post', body: 'A body' };
const complete = (text) => ({
  choices: [{ finish_reason: 'stop', message: { content: text } }]
});

test('preserves Markdown, newlines, and meaningful minus signs', async () => {
  let sent;
  const comment = 'First paragraph\n\n- A list\n- Temperature: −5°C';
  const app = sandbox(['lib/generator.js'], {
    fetch: async (url, options) => {
      sent = options;
      return { ok: true, json: async () => complete(comment) };
    }
  });
  assert.equal(await app.generateComment(post, settings, 'sk-test'), comment);
  assert.ok(sent.signal);
  assert.equal(
    JSON.parse(sent.body).messages[1].content,
    JSON.stringify({ title: post.title, body: post.body, context: '' })
  );
});

for (const [label, response] of [
  ['missing choices', {}],
  ['null content', complete(null)],
  ['empty content', complete('   ')],
  [
    'truncated content',
    {
      choices: [{ finish_reason: 'length', message: { content: 'incomplete' } }]
    }
  ],
  [
    'refusal',
    {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'No', refusal: 'refused' }
        }
      ]
    }
  ],
  ['oversized content', complete('x'.repeat(10001))]
]) {
  test('rejects ' + label, async () => {
    const app = sandbox(['lib/generator.js'], {
      fetch: async () => ({ ok: true, json: async () => response })
    });
    await assert.rejects(app.generateComment(post, settings, 'sk-test'));
  });
}

test('rejects oversized input before spending an API request', async () => {
  const app = sandbox(['lib/generator.js'], {
    fetch: () => {
      throw new Error('must not fetch');
    }
  });
  await assert.rejects(
    app.generateComment(
      { title: 'A', body: 'x'.repeat(30000) },
      settings,
      'sk-test'
    ),
    /30,000/
  );
});

test('rate limit responses are actionable without exposing provider response data', async () => {
  const app = sandbox(['lib/generator.js'], {
    fetch: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'secret' })
    })
  });
  await assert.rejects(
    app.generateComment(post, settings, 'sk-test'),
    /quota or rate limit/
  );
});

test('aborts a stalled request and clears its deadline timer', async () => {
  let deadline;
  let cleared = false;
  const app = sandbox(['lib/generator.js'], {
    setTimeout: (callback) => {
      deadline = callback;
      return 1;
    },
    clearTimeout: () => {
      cleared = true;
    },
    fetch: async (_, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error(), { name: 'AbortError' }))
        );
      })
  });
  const pending = app.generateComment(post, settings, 'sk-test');
  deadline();
  await assert.rejects(pending, /timed out/);
  assert.equal(cleared, true);
});
