# AI Sentinel Super Advanced Rewrite TODO

## Current Status: Plan Approved (Code Llama / DeepSeek-Coder-v2 focus for powerful code gen)

### Steps from Approved Plan:

1. **Update package.json**
   - Add webview sidebar contribution.
   - Update displayName/description/version for "Super AI Sentinel".
   - No new deps.

2. **Create src/types.ts**
   - Interfaces: Extended Action (file, command, test, refine), WebviewMessage.

3. **Create src/webview.ts**
   - HTML/JS/CSS for interactive chat Webview: input, message history, code highlights, send to Ollama.

4. **Rewrite src/extension.ts**
   - Register WebviewViewProvider for sidebar.
   - Enhance askOllama command to use Webview.
   - Multi-model: default 'codex' or 'deepseek-coder-v2' (powerful code), user-selectable.
   - Personality prompt: witty/engaging.
   - New actions: <test> run tests, <lint> format/lint.
   - Post-write: auto-format, git stage/commit suggest.
   - Fallback: show raw Ollama text if no XML.

5. **Build & Test**
   - `npm run compile`
   - F5 → test in new window.
   - Sidebar "AI Sentinel Chat" + command.
   - Prompt: "powerful todo app with React"

6. **Optional Polish**
   - Add animations in Webview.
   - Ollama model installer command.

[x] Step 4 Complete\n\n[ ] Step 5: Build & Test**
