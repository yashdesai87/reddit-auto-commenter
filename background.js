async function generateComment(title, body, apiKey, model = 'gpt-3.5-turbo', context = '', postContext = '') {
  try {
    let systemPrompt = 'You are a helpful Reddit commenter. Generate thoughtful, engaging comments that add value to the discussion. Keep comments conversational and authentic. Avoid being overly formal or promotional.';
    
    if (context) {
      systemPrompt += ` Additional context: ${context}`;
    }
    
    let userPrompt = `Post Title: ${title}\n\nPost Body: ${body}`;
    
    if (postContext) {
      userPrompt += `\n\nAdditional Post Context: ${postContext}`;
    }
    
    userPrompt += '\n\nGenerate an appropriate comment for this Reddit post.';
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`OpenAI API error: ${errorMessage}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from OpenAI API');
    }
    
    const rawComment = data.choices[0].message.content.trim();
    return cleanComment(rawComment);
  } catch (error) {
    // Pass through the actual error message instead of wrapping it
    throw error;
  }
}

function cleanComment(comment) {
  // Replace various types of problematic hyphens and dashes with regular space
  return comment
    .replace(/—/g, ' ')     // Em dash
    .replace(/–/g, ' ')     // En dash
    .replace(/−/g, ' ')     // Minus sign
    .replace(/‒/g, ' ')     // Figure dash
    .replace(/‑/g, ' ')     // Non-breaking hyphen
    .replace(/⸺/g, ' ')     // Two-em dash
    .replace(/⸻/g, ' ')     // Three-em dash
    .replace(/\s+/g, ' ')   // Replace multiple spaces with single space
    .trim();                // Remove leading/trailing whitespace
}

async function sendMessageToTab(tabId, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
        if (i === retries - 1) {
          throw new Error('Unable to connect to the page. Please refresh the page and try again.');
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        throw error;
      }
    }
  }
}

async function processComment(tabId) {
  try {
    const result = await chrome.storage.sync.get(['openaiApiKey', 'gptModel', 'commentContext', 'postContext']);
    
    if (!result.openaiApiKey) {
      return { success: false, error: 'OpenAI API key not found. Please set it in the extension popup.' };
    }

    const postData = await sendMessageToTab(tabId, { action: 'extractPost' });
    
    if (postData.error) {
      return { success: false, error: postData.error };
    }
    
    const comment = await generateComment(postData.title, postData.body, result.openaiApiKey, result.gptModel || 'gpt-3.5-turbo', result.commentContext, result.postContext);
    
    const insertResult = await sendMessageToTab(tabId, { action: 'insertComment', comment });
    
    if (insertResult.error) {
      return { success: false, error: insertResult.error };
    }
    
    const submitResult = await sendMessageToTab(tabId, { action: 'submitComment' });
    
    if (submitResult.error) {
      return { success: false, error: submitResult.error };
    }
    
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateComment') {
    processComment(request.tabId).then(sendResponse);
    return true;
  } else if (request.action === 'generateOnly') {
    generateComment(request.title, request.body, request.apiKey, request.model || 'gpt-3.5-turbo', request.context, request.postContext)
      .then(comment => sendResponse({ success: true, comment }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

