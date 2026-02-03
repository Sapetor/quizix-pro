# Claude Code Status Line Setup Guide

This guide explains how to set up the custom status line (HUD) on other devices running Claude Code.

## Prerequisites

- Node.js 18+ installed
- Claude Code CLI installed
- npm configured with a global directory

## Quick Setup

### 1. Install the Oh-My-Claude package

```bash
npm install -g oh-my-claude-sisyphus
```

### 2. Create the HUD directory and script

```bash
mkdir -p ~/.claude/hud
```

Create `~/.claude/hud/omc-hud.mjs`:

```javascript
#!/usr/bin/env node
/**
 * OMC HUD - Statusline Script
 * Direct import from npm global install
 */

import { pathToFileURL } from "node:url";

// Update this path to match your npm global install location
// Common locations:
//   Linux/macOS: ~/.npm-global/lib/node_modules/oh-my-claude-sisyphus/dist/hud/index.js
//   Windows: %APPDATA%/npm/node_modules/oh-my-claude-sisyphus/dist/hud/index.js

const hudPath = process.env.HOME + "/.npm-global/lib/node_modules/oh-my-claude-sisyphus/dist/hud/index.js";

try {
  await import(pathToFileURL(hudPath).href);
} catch (err) {
  console.log(`[OMC] ${err.message}`);
}
```

Make it executable (Linux/macOS):
```bash
chmod +x ~/.claude/hud/omc-hud.mjs
```

### 3. Find your npm global path

If the default path doesn't work, find your actual npm global location:

```bash
npm root -g
```

Update the `hudPath` in the script to match your system.

### 4. Configure Claude Code settings

Edit `~/.claude/settings.json` and add the statusLine configuration:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/hud/omc-hud.mjs"
  }
}
```

Or use the full path:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node /home/YOUR_USERNAME/.claude/hud/omc-hud.mjs"
  }
}
```

### 5. Restart Claude Code

Exit and restart Claude Code for changes to take effect.

## Troubleshooting

### Status line not appearing

1. Check if the package is installed:
   ```bash
   npm list -g oh-my-claude-sisyphus
   ```

2. Verify the HUD path exists:
   ```bash
   ls -la $(npm root -g)/oh-my-claude-sisyphus/dist/hud/index.js
   ```

3. Test the script manually:
   ```bash
   node ~/.claude/hud/omc-hud.mjs
   ```

### Wrong npm global path

Different systems have different npm global paths:

| System | Typical Path |
|--------|--------------|
| Linux (custom prefix) | `~/.npm-global/lib/node_modules/` |
| Linux (default) | `/usr/lib/node_modules/` |
| macOS (Homebrew) | `/usr/local/lib/node_modules/` |
| macOS (nvm) | `~/.nvm/versions/node/vXX.X.X/lib/node_modules/` |
| Windows | `%APPDATA%\npm\node_modules\` |

### Permission errors

On Linux/macOS, ensure the script is executable:
```bash
chmod +x ~/.claude/hud/omc-hud.mjs
```

## Optional: Copy Full Configuration

To copy the complete setup including hooks, copy these directories:

```bash
# On source machine, create a backup
tar -czvf claude-config-backup.tar.gz \
  ~/.claude/settings.json \
  ~/.claude/hud/ \
  ~/.claude/hooks/ \
  ~/.claude/sounds/

# On target machine, extract
tar -xzvf claude-config-backup.tar.gz -C ~/
```

Then install the npm package on the target machine:
```bash
npm install -g oh-my-claude-sisyphus
```

## What the Status Line Shows

The OMC HUD displays real-time information including:
- Current task status
- Token usage
- Active hooks
- Session information

---

*Generated for Claude Code status line replication across devices.*
