function extractPostData() {
  const titleElement = document.querySelector('a.title');
  const bodyElement = document.querySelector('div.entry div.usertext-body');
  
  if (!titleElement) {
    alert('Error: Post title not found. Please make sure you are on a Reddit post page.');
    return { error: 'Post title not found' };
  }
  
  const title = titleElement.textContent.trim();
  const body = bodyElement ? bodyElement.textContent.trim() : '';
  
  return { title, body };
}

function insertComment(comment) {
  const textArea = document.querySelector('div.usertext-edit textarea');
  
  if (!textArea) {
    return { error: 'Comment textarea not found' };
  }
  
  textArea.value = comment;
  textArea.dispatchEvent(new Event('input', { bubbles: true }));
  
  return { success: true };
}

function submitComment() {
  const submitButton = document.querySelector('div.usertext-buttons button[type="submit"]');
  
  if (!submitButton) {
    return { error: 'Submit button not found' };
  }
  
  submitButton.click();
  
  setTimeout(() => {
    // Refresh the current post to show the new comment
    window.location.reload();
  }, 1500);
  
  return { success: true };
}

function generateLoremIpsum() {
  const loremTexts = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
    "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium."
  ];
  
  return loremTexts[Math.floor(Math.random() * loremTexts.length)];
}

function insertLoremComment() {
  const comment = generateLoremIpsum();
  return insertComment(comment);
}

// Debug: Log that content script has loaded
console.log('Reddit Auto Commenter: Content script loaded on', window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Reddit Auto Commenter: Received message', request.action);
  
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'Content script is loaded' });
  } else if (request.action === 'extractPost') {
    const postData = extractPostData();
    sendResponse(postData);
  } else if (request.action === 'insertComment') {
    const result = insertComment(request.comment);
    sendResponse(result);
  } else if (request.action === 'insertLoremComment') {
    const result = insertLoremComment();
    sendResponse(result);
  } else if (request.action === 'submitComment') {
    const result = submitComment();
    sendResponse(result);
  }
  
  return true;
});