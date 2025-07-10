document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const gptModelSelect = document.getElementById('gptModel');
  const contextInput = document.getElementById('context');
  const postContextInput = document.getElementById('postContext');
  const requireConfirmationInput = document.getElementById('requireConfirmation');
  const saveBtn = document.getElementById('saveBtn');
  const commentBtn = document.getElementById('commentBtn');
  const status = document.getElementById('status');
  
  const result = await chrome.storage.sync.get(['openaiApiKey', 'gptModel', 'commentContext', 'postContext', 'requireConfirmation']);
  if (result.openaiApiKey) {
    apiKeyInput.value = result.openaiApiKey;
  }
  if (result.gptModel) {
    gptModelSelect.value = result.gptModel;
  }
  if (result.commentContext) {
    contextInput.value = result.commentContext;
  }
  if (result.postContext) {
    postContextInput.value = result.postContext;
  }
  if (result.requireConfirmation) {
    requireConfirmationInput.checked = result.requireConfirmation;
  }
  
  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    // Clear any existing timeout
    if (showStatus.timeoutId) {
      clearTimeout(showStatus.timeoutId);
    }
    
    // Only auto-hide success messages, keep error messages for 20 seconds
    const timeout = type === 'error' ? 20000 : (type === 'success' ? 10000 : 20000);
    
    showStatus.timeoutId = setTimeout(() => {
      status.style.display = 'none';
    }, timeout);
  }
  
  async function ensureContentScriptLoaded(tabId) {
    try {
      // Try to inject the content script if it's not already loaded
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    } catch (error) {
      // Content script might already be loaded, which is fine
      console.log('Content script injection attempted:', error.message);
    }
  }

  async function checkContentScriptLoaded(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return response.success;
    } catch (error) {
      return false;
    }
  }

  async function sendMessageToTab(tabId, message, retries = 3) {
    // First check if content script is loaded
    const isLoaded = await checkContentScriptLoaded(tabId);
    if (!isLoaded) {
      console.log('Content script not loaded, attempting injection...');
      await ensureContentScriptLoaded(tabId);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for injection
    }
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
      } catch (error) {
        if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
          if (i === retries - 1) {
            throw new Error('Unable to connect to the page. The content script may not be compatible with this page. Please try refreshing the page or check if you are on a Reddit post page.');
          }
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 800));
        } else {
          throw error;
        }
      }
    }
  }
  
  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const gptModel = gptModelSelect.value;
    const context = contextInput.value.trim();
    const postContext = postContextInput.value.trim();
    const requireConfirmation = requireConfirmationInput.checked;
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      showStatus('Invalid API key format', 'error');
      return;
    }
    
    try {
      await chrome.storage.sync.set({ 
        openaiApiKey: apiKey,
        gptModel: gptModel,
        commentContext: context,
        postContext: postContext,
        requireConfirmation: requireConfirmation
      });
      showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      showStatus('Failed to save settings', 'error');
    }
  });
  
  commentBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const gptModel = gptModelSelect.value;
    const context = contextInput.value.trim();
    const postContext = postContextInput.value.trim();
    const requireConfirmation = requireConfirmationInput.checked;
    
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      showStatus('Invalid API key format', 'error');
      return;
    }
    
    try {
      commentBtn.disabled = true;
      commentBtn.textContent = 'Working...';
      
      await chrome.storage.sync.set({ 
        openaiApiKey: apiKey,
        gptModel: gptModel,
        commentContext: context,
        postContext: postContext,
        requireConfirmation: requireConfirmation
      });
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('old.reddit.com')) {
        showStatus('Please navigate to old.reddit.com first', 'error');
        return;
      }
      
      showStatus('Extracting post data...', 'info');
      
      const extractResponse = await sendMessageToTab(tab.id, { action: 'extractPost' });
      
      if (extractResponse.error) {
        showStatus(extractResponse.error, 'error');
        return;
      }
      
      showStatus('Generating AI comment...', 'info');
      
      const result = await chrome.storage.sync.get(['openaiApiKey', 'gptModel', 'commentContext', 'postContext']);
      
      const generateResponse = await chrome.runtime.sendMessage({
        action: 'generateOnly',
        title: extractResponse.title,
        body: extractResponse.body,
        apiKey: result.openaiApiKey,
        model: result.gptModel || 'gpt-3.5-turbo',
        context: result.commentContext,
        postContext: result.postContext
      });
      
      if (!generateResponse.success) {
        showStatus(generateResponse.error || 'Failed to generate comment', 'error');
        return;
      }
      
      if (requireConfirmation) {
        const confirmPost = confirm(`Generated comment:\n\n${generateResponse.comment}\n\nDo you want to post this comment?`);
        if (!confirmPost) {
          showStatus('Comment posting cancelled by user', 'info');
          return;
        }
      }
      
      showStatus('Posting comment...', 'info');
      
      const insertResponse = await sendMessageToTab(tab.id, { 
        action: 'insertComment', 
        comment: generateResponse.comment 
      });
      
      if (insertResponse.error) {
        showStatus(insertResponse.error, 'error');
        return;
      }
      
      const submitResponse = await sendMessageToTab(tab.id, { action: 'submitComment' });
      
      if (submitResponse.error) {
        showStatus(submitResponse.error, 'error');
        return;
      }
      
      showStatus('Comment posted successfully!', 'success');
      setTimeout(() => window.close(), 1000);
      
    } catch (error) {
      showStatus(`Error: ${error.message || 'Failed to generate comment'}`, 'error');
    } finally {
      commentBtn.disabled = false;
      commentBtn.textContent = 'Comment!';
    }
  });
});