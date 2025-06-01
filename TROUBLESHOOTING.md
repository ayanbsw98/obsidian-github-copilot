# Troubleshooting GitHub Copilot Edit Mode

If you're seeing "Copilot is not ready yet" when trying to use edit mode, follow these steps:

## 1. Check Plugin Settings

1. Go to **Settings** → **Community Plugins** → **GitHub Copilot**
2. Ensure the following are configured:

### Enable Copilot
- ✅ **Enable Copilot** should be turned ON

### Node.js Path Configuration
- 📁 **Node binary path** must be set to a valid Node.js 20+ installation
- Default value "default" will NOT work
- Examples:
  - Windows: `C:\Program Files\nodejs\node.exe`
  - macOS: `/usr/local/bin/node` or `/opt/homebrew/bin/node`
  - Linux: `/usr/bin/node`

### Test Your Node.js Path
1. Click **"Test the path"** button in settings
2. Ensure it shows Node.js version 20 or higher

## 2. Install Node.js (if needed)

If you don't have Node.js 20+:
1. Visit [nodejs.org](https://nodejs.org/)
2. Download and install Node.js 20 LTS or later
3. Restart Obsidian
4. Update the Node binary path in plugin settings

## 3. Sign In to GitHub Copilot

1. In plugin settings, click **"Restart sign-in process"**
2. Follow the authentication flow
3. Make sure you have an active GitHub Copilot subscription

## 4. Test Edit Mode

1. Open the GitHub Copilot chat panel
2. Click the **"Edit"** tab
3. Click **"Test Connection"** button
4. If you see "✅ Copilot is ready for editing!", you're all set!

## 5. Common Issues

### "Node.js path not configured"
- Set a valid Node.js path in settings (not "default")

### "Copilot agent not initialized"
- Restart Obsidian after configuring Node.js path
- Check that Copilot is enabled in settings

### "Copilot client not ready"
- Verify Node.js version is 20+
- Try restarting the sign-in process
- Restart Obsidian

## 6. Getting Help

If you're still having issues:
1. Enable **Debug mode** in plugin settings
2. Open Developer Console (Ctrl+Shift+I)
3. Look for error messages in the Console tab
4. Report issues with error details

## Edit Mode Usage

Once Copilot is ready:
1. Switch to **Edit** mode in the chat panel
2. Select a note from the dropdown
3. Enter your edit instruction (e.g., "Fix grammar", "Summarize", "Rephrase professionally")
4. Click **Apply Edit**
5. The note will be updated automatically
