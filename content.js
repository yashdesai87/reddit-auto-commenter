(() => {
  'use strict';

  // Recovery injection can race with the manifest's automatic injection.
  // One listener per document prevents a single message from submitting twice.
  if (globalThis.__redditCommenterLoaded) return;
  globalThis.__redditCommenterLoaded = true;
  let submitting = false;

  function visible(element) {
    return Boolean(element && element.getClientRects().length);
  }

  function page(expectedId) {
    const match = location.pathname.match(
      /^\/r\/[^/]+\/comments\/([a-z0-9]+)(?:\/|$)/i
    );
    if (
      location.protocol !== 'https:' ||
      location.hostname !== 'old.reddit.com' ||
      !match ||
      't3_' + match[1].toLowerCase() !== expectedId
    ) {
      throw new Error('The page is no longer the selected Reddit post.');
    }
    const post = document.querySelector(
      '.thing.link[data-fullname="' + expectedId + '"]'
    );
    const area = document.querySelector('.commentarea');
    const user = document.querySelector('#header-bottom-right .user a');
    if (!post || !area)
      throw new Error('The post or comment area is unavailable.');
    if (!user) throw new Error('Log into Reddit before generating a comment.');

    // A top-level form must belong to this post, not to a nested reply or edit.
    const form = [...area.querySelectorAll('form.usertext')].find(
      (candidate) =>
        !candidate.closest('.thing.comment') &&
        candidate.querySelector('input[name="thing_id"]')?.value === expectedId
    );
    const textarea = form?.querySelector('textarea[name="text"]');
    const button = form?.querySelector('button[type="submit"]');
    if (
      !visible(textarea) ||
      textarea.disabled ||
      !visible(button) ||
      button.disabled
    ) {
      throw new Error(
        'Commenting is unavailable. The post may be locked, archived, or restricted.'
      );
    }
    return {
      post,
      area,
      form,
      textarea,
      button,
      username: user.textContent.trim()
    };
  }

  function extract(expectedId) {
    const { post, textarea } = page(expectedId);
    if (textarea.value.trim())
      throw new Error(
        'Your Reddit comment box contains a draft. Save or clear it first.'
      );
    const title = post.querySelector('a.title')?.textContent.trim();
    if (!title) throw new Error('Post title not found.');
    // Link posts have no selftext. Never use the first comment as their body.
    const body =
      post.querySelector('.expando .usertext-body')?.textContent.trim() || '';
    return { title, body };
  }

  async function submit(expectedId, comment) {
    if (submitting) throw new Error('A submission is already in progress.');
    if (
      typeof comment !== 'string' ||
      !comment.trim() ||
      comment.length > 10000
    ) {
      throw new Error('Enter a comment between 1 and 10,000 characters.');
    }
    const { area, form, textarea, button, username } = page(expectedId);
    if (textarea.value.trim())
      throw new Error(
        'Your existing Reddit draft was preserved. Save or clear it first.'
      );
    const before = new Set(
      [...area.querySelectorAll('.thing.comment')].map(
        (node) => node.dataset.fullname
      )
    );
    submitting = true;
    try {
      return await new Promise((resolve, reject) => {
        let finished = false;
        const finish = (error, value) => {
          if (finished) return;
          finished = true;
          observer.disconnect();
          clearTimeout(timer);
          error ? reject(error) : resolve(value);
        };
        const inspect = () => {
          const error = [...form.querySelectorAll('.error')].find(
            (node) => visible(node) && node.textContent.trim()
          );
          if (error)
            return finish(
              new Error(
                'Reddit rejected the comment: ' + error.textContent.trim()
              )
            );
          // A click is not success. Require a new comment by this user AND the
          // submitted form clearing, which Reddit does after a successful reply.
          const added = [...area.querySelectorAll('.thing.comment')].find(
            (node) =>
              node.dataset.fullname &&
              !before.has(node.dataset.fullname) &&
              node.querySelector('.entry .author')?.textContent.trim() ===
                username &&
              !node.parentElement?.closest('.thing.comment')
          );
          if (added && !textarea.value.trim())
            finish(null, { commentId: added.dataset.fullname });
        };
        const observer = new MutationObserver(inspect);
        const timer = setTimeout(
          () =>
            finish(
              new Error(
                'Submission was not confirmed within 20 seconds. Check Reddit before retrying.'
              )
            ),
          20000
        );
        observer.observe(area, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
        textarea.value = comment;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        try {
          button.click();
          inspect();
        } catch (error) {
          finish(error);
        }
      });
    } finally {
      submitting = false;
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      !['ping', 'extract', 'submit'].includes(request?.action)
    )
      return false;
    Promise.resolve()
      .then(() => {
        if (request.action === 'ping') return {};
        if (request.action === 'extract') return extract(request.postId);
        return submit(request.postId, request.comment);
      })
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  });
})();
