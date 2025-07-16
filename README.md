# Reddit Auto Commenter

A Chrome extension that automatically generates and posts AI-powered comments on Reddit using OpenAI's GPT models.

## Features

- Generate AI-powered comments for Reddit posts
- Support for multiple GPT models (GPT-3.5, GPT-4, GPT-4o, etc.)
- Customizable system prompts and context
- Optional confirmation before posting
- Works exclusively with old.reddit.com

## Screenshot

![Extension Interface](assets/1.png)

## Quick Start

1. **Install the Extension**
   - Clone this repository or download the source code
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" and click "Load unpacked"
   - Select the folder containing the extension files

2. **Get OpenAI API Key**
   - Visit [platform.openai.com](https://platform.openai.com)
   - Create an account and generate an API key
   - Add credits to your OpenAI account

3. **Configure Extension**
   - Click the extension icon in Chrome
   - Enter your OpenAI API key (starts with "sk-")
   - Choose your preferred GPT model
   - Click "Save Settings"

4. **Start Commenting**
   - Go to [old.reddit.com](https://old.reddit.com) and open any post
   - Click the extension icon and hit "Comment!"
   - Review and post your AI-generated comment

## Configuration Options

- **OpenAI API Key**: Your authentication key for OpenAI services
- **GPT Model**: Choose between different AI models (3.5-turbo recommended for cost)
- **Custom Content**: Add specific instructions to personalize comments
- **Additional Context**: Provide extra information about posts
- **Require Confirmation**: Review comments before posting (recommended)

## Troubleshooting

**Extension Not Loading**
- Ensure Developer Mode is enabled in Chrome extensions
- Check that all files are in the same folder

**Comments Not Generating** 
- Verify your API key is correct and has credits
- Make sure you're on old.reddit.com (not www.reddit.com)
- Ensure you're viewing a specific post

## Documentation

For detailed setup instructions, field explanations, and technical documentation, see [TECHNICAL.md](TECHNICAL.md).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Development

To modify the extension:
1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click refresh on the extension
4. Test your changes