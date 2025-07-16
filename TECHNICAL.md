# Technical Documentation

This document provides detailed technical information about the Reddit Auto Commenter Chrome extension, including comprehensive setup instructions, field explanations, code architecture, and data flow.

## Table of Contents

- [Detailed Installation Guide](#detailed-installation-guide)
- [OpenAI API Key Setup](#openai-api-key-setup)
- [Configuration Fields Explained](#configuration-fields-explained)
- [Code Structure and Architecture](#code-structure-and-architecture)
- [Data Flow Architecture](#data-flow-architecture)
- [Security Features](#security-features)
- [Advanced Troubleshooting](#advanced-troubleshooting)

## Detailed Installation Guide

### Prerequisites
- Google Chrome browser (latest version recommended)
- OpenAI API key with sufficient credits
- Basic understanding of Chrome extensions

### Step-by-Step Installation

1. **Download the Extension**
   - Clone this repository: `git clone https://github.com/yashdesai87/reddit-ai-comment-chrome-extension.git`
   - Or download as ZIP and extract to a folder on your computer

2. **Open Chrome Extensions Management**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Alternative: Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner
   - This enables loading unpacked extensions

4. **Load the Extension**
   - Click the "Load unpacked" button
   - Navigate to and select the folder containing `manifest.json`
   - The extension should appear in your extensions list with a generated ID

5. **Verify Installation**
   - Check that the extension appears in `chrome://extensions/`
   - Ensure it's enabled (toggle switch is on)
   - Look for the extension icon in the Chrome toolbar

6. **Pin Extension (Recommended)**
   - Click the puzzle piece icon in Chrome toolbar
   - Find "Reddit Auto Commenter" 
   - Click the pin icon to keep it permanently visible

## OpenAI API Key Setup

### Creating an OpenAI Account

1. **Sign Up Process**
   - Visit [platform.openai.com](https://platform.openai.com)
   - Click "Sign up" if you're new, or "Log in" for existing users
   - Complete registration with email verification
   - Provide phone number for account verification (required)

2. **Account Verification**
   - Verify your email address via the confirmation link
   - Complete phone number verification via SMS
   - Accept OpenAI's terms of service and usage policies

### API Key Generation

1. **Access API Dashboard**
   - Log into your OpenAI account
   - Click your profile icon (top-right corner)
   - Select "View API keys" from dropdown
   - Direct link: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

2. **Create New Secret Key**
   - Click "Create new secret key" button
   - Provide a descriptive name (e.g., "Reddit Commenter Extension")
   - Optionally set permissions and expiration
   - Click "Create secret key"

3. **Secure Key Storage**
   - **Critical**: Copy the key immediately after creation
   - Store in a secure location (password manager recommended)
   - The key will not be visible again after closing the dialog
   - Key format: `sk-proj-...` or `sk-...` followed by alphanumeric characters

### Billing and Credits Setup

1. **Add Payment Method**
   - Navigate to [platform.openai.com/account/billing](https://platform.openai.com/account/billing)
   - Click "Add payment method"
   - Enter credit card or PayPal information
   - Verify payment method

2. **Purchase Credits**
   - Choose a credit amount (minimum $5 recommended)
   - Complete purchase transaction
   - Credits appear in your account balance

3. **Set Usage Limits (Optional)**
   - Configure monthly spending limits
   - Set up usage notifications
   - Monitor consumption in the billing dashboard

### API Key Security Best Practices

- **Never share API keys** with others or post publicly
- **Don't commit keys** to version control systems
- **Use unique keys** for different applications
- **Regularly rotate keys** (monthly/quarterly)
- **Monitor usage** for unusual activity
- **Revoke compromised keys** immediately from OpenAI dashboard
- **Store securely** using password managers or secure vaults

## Configuration Fields Explained

### 1. OpenAI API Key Field

**Purpose**: Authentication credential for OpenAI API access
- **Format**: Must begin with `sk-` followed by project identifier and secret
- **Storage**: Encrypted in Chrome's synchronized storage
- **Validation**: Extension verifies format before saving
- **Security**: Never transmitted except to OpenAI's servers via HTTPS
- **Example Format**: `sk-proj-abc123def456...`

**Error Handling**:
- Invalid format warning if doesn't start with `sk-`
- Connection errors if key is revoked or invalid
- Billing errors if insufficient credits

### 2. GPT Model Selection

**Purpose**: Determines which OpenAI model processes comment generation

**Available Models**:

- **`gpt-3.5-turbo`**
  - Cost: ~$0.002/1K tokens
  - Speed: Fast (1-3 seconds)
  - Quality: Good for basic comments
  - Best for: High-volume usage, simple responses

- **`gpt-4`**
  - Cost: ~$0.03/1K tokens (15x more expensive)
  - Speed: Moderate (3-8 seconds)
  - Quality: Superior reasoning and context understanding
  - Best for: Complex discussions, nuanced responses

- **`gpt-4o-mini`**
  - Cost: ~$0.00015/1K tokens
  - Speed: Very fast (1-2 seconds)
  - Quality: Optimized balance of speed and capability
  - Best for: Most use cases, recommended default

- **`gpt-4o`**
  - Cost: ~$0.005/1K tokens
  - Speed: Fast (2-4 seconds)
  - Quality: Latest capabilities, multimodal support
  - Best for: Advanced reasoning, creative responses

- **`gpt-4-turbo`**
  - Cost: ~$0.01/1K tokens
  - Speed: Fast (2-5 seconds)
  - Quality: Extended context window (128K tokens)
  - Best for: Long posts, complex context understanding

**Recommendation**: Start with `gpt-4o-mini` for optimal cost/performance balance.

### 3. Built-in System Prompt (Read-Only)

**Content**: 
```
You are a helpful Reddit commenter. Generate thoughtful, engaging comments that add value to the discussion. Keep comments conversational and authentic. Avoid being overly formal or promotional.
```

**Purpose**: Establishes base behavior and tone for AI responses
- **Immutable**: Cannot be edited by users
- **Enhanced**: Combined with custom context fields
- **Guidelines**: Promotes helpful, authentic Reddit interaction style

### 4. Custom Content Field (Optional)

**Purpose**: Personalizes AI behavior with specific instructions

**Effective Examples**:
- `"Be supportive and encouraging, especially for people sharing struggles"`
- `"Ask thoughtful follow-up questions to continue discussions"`
- `"Share relevant technical knowledge when appropriate"`
- `"Use a casual, friendly tone with occasional humor"`
- `"Focus on providing helpful resources and links"`

**Implementation**: Appended to system prompt as: `Additional context: [your content]`

**Best Practices**:
- Keep instructions concise but specific
- Focus on tone and approach rather than content
- Test different styles to find what works for your use case
- Avoid contradicting the base system prompt

### 5. Additional Post Context Field (Optional)

**Purpose**: Provides extra information about posts not visible in title/body

**Use Cases**:
- **Technical Context**: `"This relates to React 18's concurrent features"`
- **Ongoing Discussions**: `"This is part of an ongoing debate about crypto regulation"`
- **Industry Knowledge**: `"This company recently announced layoffs affecting this team"`
- **Acronym Clarification**: `"API means Application Programming Interface in this context"`
- **Cultural References**: `"This references a popular meme from last week"`

**Implementation**: Added to user prompt as: `Additional Post Context: [your context]`

**Tips**:
- Provide objective, factual context
- Explain specialized terms or concepts
- Give background on current events or trends
- Clarify ambiguous references

### 6. Require Confirmation Checkbox

**Purpose**: Enables review of generated comments before posting

**When Enabled**:
- Shows comment in browser popup/alert
- User can approve or cancel posting
- Allows manual review for appropriateness
- Provides learning opportunity to improve prompts

**Benefits**:
- **Quality Control**: Catch inappropriate or off-topic responses
- **Learning Tool**: Understand how different prompts affect output
- **Safety Net**: Prevent posting in sensitive discussions
- **Customization**: Fine-tune prompts based on output quality

**Recommendation**: Enable when starting out, disable once comfortable with outputs

## Code Structure and Architecture

### File Structure Overview

```
reddit-commenter/
├── manifest.json      # Extension configuration and permissions
├── popup.html         # User interface (HTML/CSS)
├── popup.js          # Frontend logic and user interactions  
├── content.js        # Reddit DOM manipulation
├── background.js     # OpenAI API integration
├── README.md         # Basic documentation
├── TECHNICAL.md      # This detailed documentation
└── LICENSE           # MIT license
```

### Component Architecture

#### 1. `manifest.json` - Extension Configuration

**Purpose**: Defines extension metadata, permissions, and entry points

**Key Sections**:
```json
{
  "manifest_version": 3,           // Latest Chrome extension API
  "name": "Reddit Auto Commenter", // Extension display name
  "version": "1.0.0",             // Version number
  "permissions": [                 // Required permissions
    "activeTab",                  // Access current tab
    "storage",                    // Save settings locally
    "scripting"                   // Inject content scripts
  ],
  "host_permissions": [            // Domain access
    "https://old.reddit.com/*",   // Reddit interaction
    "https://api.openai.com/*"    // OpenAI API calls
  ],
  "content_scripts": [...],       // Auto-inject into Reddit
  "action": {...},                // Popup configuration
  "background": {...}             // Service worker setup
}
```

**Security Considerations**:
- Minimal required permissions
- Specific domain restrictions
- No broad web access

#### 2. `popup.html` - User Interface

**Purpose**: Creates the visual interface for extension popup

**Structure**:
- **Form Fields**: API key input, model selector, text areas
- **Styling**: Embedded CSS for consistent, professional appearance
- **Responsive Design**: Optimized for Chrome's popup constraints (400x600px)
- **Status Display**: Dynamic message area for user feedback

**CSS Highlights**:
- Clean, modern design following Chrome extension guidelines
- Accessible color contrast and font sizes
- Hover states and visual feedback for interactions
- Error/success state styling for status messages

#### 3. `popup.js` - Frontend Logic (`popup.js:1-227`)

**Purpose**: Handles user interactions and coordinates extension components

**Key Functions**:

- **`DOMContentLoaded` Event Handler**: 
  - Loads saved settings from Chrome storage
  - Populates form fields with previous values
  - Initializes event listeners

- **`showStatus(message, type)` (`popup.js:28-44`)**:
  - Displays feedback messages to users
  - Supports success, error, and info message types
  - Auto-hides success messages, keeps errors visible longer
  - Manages timeout clearing for message updates

- **`ensureContentScriptLoaded(tabId)` (`popup.js:46-57`)**:
  - Dynamically injects content script if not already present
  - Handles race conditions and injection failures gracefully
  - Critical for reliable communication with Reddit pages

- **`sendMessageToTab(tabId, message, retries)` (`popup.js:68-93`)**:
  - Robust message passing with automatic retry logic
  - Handles connection failures and timing issues
  - Provides clear error messages for troubleshooting

- **Save Button Handler (`popup.js:95-124`)**:
  - Validates API key format (must start with "sk-")
  - Saves all settings to Chrome's synchronized storage
  - Provides immediate feedback on save success/failure

- **Comment Button Handler (`popup.js:126-226`)**:
  - Orchestrates entire comment generation workflow
  - Validates inputs and current page context
  - Handles optional user confirmation step
  - Manages button states during processing
  - Provides detailed progress updates

#### 4. `content.js` - Reddit Page Interaction (`content.js:1-96`)

**Purpose**: Directly manipulates Reddit's DOM elements and extracts data

**Key Functions**:

- **`extractPostData()` (`content.js:1-14`)**:
  - Uses CSS selectors to find Reddit post elements:
    - Title: `a.title` selector
    - Body: `div.entry div.usertext-body` selector
  - Returns structured data object or error messages
  - Handles missing elements gracefully

- **`insertComment(comment)` (`content.js:16-27`)**:
  - Locates Reddit's comment textarea: `div.usertext-edit textarea`
  - Inserts generated comment text
  - Triggers input events to notify Reddit's JavaScript
  - Returns success/error status

- **`submitComment()` (`content.js:29-44`)**:
  - Finds submit button: `div.usertext-buttons button[type="submit"]`
  - Programmatically clicks to submit comment
  - Refreshes the current post page to show the new comment
  - Keeps user on the same post they were commenting on

- **`generateLoremIpsum()` (`content.js:46-61`)**:
  - Debug utility for testing without API calls
  - Provides placeholder text for development
  - Can be used for testing DOM manipulation

- **Message Listener (`content.js:66-86`)**:
  - Handles communication from popup script
  - Responds to ping requests for connectivity testing
  - Processes extract, insert, and submit commands
  - Returns structured responses for error handling

#### 5. `background.js` - AI Integration (`background.js:1-140`)

**Purpose**: Manages OpenAI API communication and comment generation

**Key Functions**:

- **`generateComment()` (`background.js:1-58`)**:
  - **Prompt Construction**:
    - Combines base system prompt with custom context
    - Builds user prompt with title, body, and additional context
    - Structures prompts for optimal AI performance
  
  - **API Communication**:
    - Makes HTTPS POST requests to OpenAI's Chat Completions endpoint
    - Uses proper authentication headers
    - Handles rate limiting and error responses
  
  - **Configuration Parameters**:
    - `max_tokens: 200`: Limits response length for Reddit appropriateness
    - `temperature: 0.7`: Balances creativity with consistency
    - `model`: User-selected from available options
  
  - **Error Handling**:
    - Parses API error responses
    - Provides meaningful error messages
    - Handles network failures and timeouts

- **`cleanComment(comment)` (`background.js:60-72`)**:
  - Removes problematic Unicode characters:
    - Em dashes (—), En dashes (–), Minus signs (−)
    - Figure dashes, Non-breaking hyphens
    - Two-em and Three-em dashes
  - Normalizes whitespace (multiple spaces to single)
  - Ensures Reddit compatibility and readability

- **`processComment(tabId)` (`background.js:93-126`)**:
  - Executes complete automated workflow:
    1. Extract post data from Reddit page
    2. Generate comment using OpenAI API
    3. Insert comment into Reddit form
    4. Submit comment automatically
  - Used for direct comment generation without confirmation
  - Returns detailed success/error information

- **Message Handlers (`background.js:128-138`)**:
  - `generateComment`: Full automated process
  - `generateOnly`: Generate comment for user review
  - Supports asynchronous operations with proper Promise handling

## Data Flow Architecture

### 1. User Configuration Phase
```
User Input → popup.html → popup.js → Chrome Storage API → Local Storage
```

**Process**:
1. User enters API key and settings in popup
2. popup.js validates input format
3. Settings saved to Chrome's encrypted sync storage
4. Settings persist across browser sessions and devices

### 2. Comment Generation Workflow
```
User Click → popup.js → content.js → background.js → OpenAI API
     ↓                      ↓             ↓           ↓
Status Update ← popup.js ← content.js ← background.js ← API Response
```

**Detailed Process**:
1. **Initiation**: User clicks "Comment!" button in popup
2. **Validation**: popup.js verifies settings and current page
3. **Extraction**: content.js extracts post title and body from Reddit DOM
4. **Generation**: background.js sends post data to OpenAI API
5. **Processing**: API returns generated comment
6. **Insertion**: content.js inserts comment into Reddit's textarea
7. **Submission**: content.js triggers Reddit's submit button
8. **Completion**: User receives success confirmation

### 3. Message Passing Architecture
```
popup.js ←→ content.js (via chrome.tabs.sendMessage)
popup.js ←→ background.js (via chrome.runtime.sendMessage)
```

**Communication Patterns**:
- **Popup ↔ Content**: DOM manipulation commands and data extraction
- **Popup ↔ Background**: API calls and comment generation
- **Error Handling**: Each layer provides meaningful error messages
- **Retry Logic**: Automatic retries for failed connections

### 4. Storage Architecture
```
User Settings → Chrome Storage API → Encrypted Local Storage
     ↓                                        ↓
Multiple Devices ← Chrome Sync ← Cloud Storage
```

**Storage Features**:
- **Encrypted**: API keys stored securely
- **Synchronized**: Settings sync across Chrome instances
- **Persistent**: Survives browser restarts and updates

## Security Features

### API Key Protection
- **Encrypted Storage**: Chrome's storage API encrypts sensitive data
- **Local Only**: Keys never transmitted except to OpenAI
- **HTTPS Required**: All API communications use secure protocols
- **No Logging**: Extension doesn't log or cache API keys

### Input Validation
- **API Key Format**: Validates "sk-" prefix before saving
- **URL Verification**: Confirms user is on old.reddit.com
- **DOM Safety**: Sanitizes extracted content before API calls
- **Error Sanitization**: Removes sensitive data from error messages

### Content Script Isolation
- **Sandbox Execution**: Runs in isolated context from Reddit's scripts
- **Limited Permissions**: Only accesses required DOM elements
- **No Global Variables**: Prevents conflicts with Reddit's JavaScript
- **CSP Compliance**: Follows Content Security Policy guidelines

### Network Security
- **HTTPS Only**: All external communications encrypted
- **Certificate Validation**: Verifies OpenAI's SSL certificates
- **No Third-Party Requests**: Only communicates with OpenAI and Reddit
- **Timeout Protection**: Prevents hanging requests

### Domain Restrictions
- **Host Permissions**: Limited to old.reddit.com and api.openai.com
- **Origin Validation**: Verifies requests come from allowed domains
- **No Broad Access**: Cannot access other websites or tabs
- **Explicit Permissions**: Users see exactly what extension accesses

## Advanced Troubleshooting

### Extension Loading Issues

**Symptom**: Extension doesn't appear in chrome://extensions/
- **Solution**: Ensure Developer Mode is enabled
- **Check**: All files (especially manifest.json) are in the same folder
- **Verify**: Folder permissions allow Chrome to read files

**Symptom**: "Invalid manifest" error
- **Check**: manifest.json syntax is valid JSON
- **Verify**: All required fields are present
- **Update**: Chrome browser to latest version

### API Connection Problems

**Symptom**: "Failed to generate comment" with network error
- **Check**: Internet connection is stable
- **Verify**: OpenAI API status at [status.openai.com](https://status.openai.com)
- **Test**: API key works in OpenAI playground

**Symptom**: "Invalid API key format" 
- **Verify**: Key starts with "sk-" (not "Bearer sk-")
- **Check**: No extra spaces or characters
- **Confirm**: Key was copied completely

**Symptom**: "Insufficient credits" error
- **Check**: OpenAI account billing page
- **Add**: More credits to account
- **Monitor**: Usage doesn't exceed monthly limits

### Reddit Integration Issues

**Symptom**: "Post title not found" error
- **Verify**: You're on a specific Reddit post (not main feed)
- **Check**: Using old.reddit.com (not www.reddit.com)
- **Refresh**: Page and try again

**Symptom**: Comment generates but doesn't post
- **Check**: You're logged into Reddit
- **Verify**: Not rate-limited by Reddit
- **Confirm**: Subreddit allows comments

### Performance Issues

**Symptom**: Extension runs slowly
- **Solution**: Switch to faster model (gpt-3.5-turbo)
- **Check**: Other Chrome extensions aren't interfering
- **Monitor**: System resources and network speed

**Symptom**: Chrome becomes unresponsive
- **Disable**: Extension temporarily
- **Check**: Chrome memory usage
- **Update**: Chrome to latest version

### Data Synchronization Issues

**Symptom**: Settings don't save across devices
- **Check**: Chrome sync is enabled in browser settings
- **Verify**: Same Google account signed into Chrome
- **Test**: Other Chrome sync features work properly

**Symptom**: Settings reset after browser restart
- **Check**: Chrome isn't in incognito/private mode
- **Verify**: Extension has storage permission
- **Clear**: Chrome's extension data and reconfigure

### Debug Mode

**Enable Console Logging**:
1. Open Chrome DevTools (F12)
2. Check Console tab for extension messages
3. Look for "Reddit Auto Commenter:" prefixed logs
4. Note any JavaScript errors or warnings

**Inspect Extension**:
1. Go to chrome://extensions/
2. Click "Details" on Reddit Auto Commenter
3. Click "Inspect views: popup" or "background page"
4. Use DevTools to debug issues

For additional support, check the main README.md troubleshooting section or create an issue in the project repository.