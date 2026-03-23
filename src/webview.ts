import * as vscode from 'vscode';

/**
 * Webview HTML with interactive chat UI for Super AI Sentinel.
 * Features: message history, code highlighting, model selector, send button.
 */
export class AISentinelWebview {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

public static createOrShow(extensionUri: vscode.Uri, column?: vscode.ViewColumn) {
    const columnToUse = column || vscode.ViewColumn.One;

    if (AISentinelWebview.currentPanel) {
      AISentinelWebview.currentPanel._panel.reveal(columnToUse);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiSentinelChat',
      'Super AI Sentinel Chat',
      vscode.ViewColumn.One,
      AISentinelWebview.getWebviewOptions(extensionUri),
    );

    AISentinelWebview.currentPanel = new AISentinelWebview(panel, extensionUri);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    AISentinelWebview.currentPanel = new AISentinelWebview(panel, extensionUri);
  }

  private static currentPanel: AISentinelWebview | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'prompt': {
            // Send to extension.ts for Ollama call
            vscode.commands.executeCommand('mr-ai.askOllama', message.payload, message.model);
            break;
          }
        }
      },
      undefined,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), undefined, this._disposables);
  }

  private _getHtmlForWebview() {
    const models = [
      { id: 'deepseek-coder-v2', name: 'DeepSeek-Coder-v2 (Powerful Code)', recommended: true },
      { id: 'codellama', name: 'Code Llama (Advanced Code Gen)' },
      { id: 'deepseek-coder', name: 'DeepSeek-Coder (Reliable)' }
    ];

    const style = `
      body { font-family: var(--vscode-font-family); background: var(--vscode-sideBar-background); color: var(--vscode-sideBar-foreground); padding: 10px; }
      #chat { height: 300px; overflow-y: auto; border: 1px solid var(--vscode-panel-border); padding: 10px; margin-bottom: 10px; background: var(--vscode-input-background); }
      .message { margin: 5px 0; padding: 8px; border-radius: 5px; }
      .user { background: var(--vscode-textLink-foreground); }
      .ai { background: var(--vscode-inputOption-activeForeground); }
      .code { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 3px; font-family: monospace; }
      #input { width: 70%; padding: 8px; }
      #model { padding: 8px; }
      button { padding: 8px 16px; background: var(--vscode-button-background); border: none; color: var(--vscode-button-foreground); cursor: pointer; }
      button:hover { background: var(--vscode-button-hoverBackground); }
    `;

    const modelSelect = models.map(m => `<option value="${m.id}" ${m.recommended ? 'selected' : ''}>${m.name}</option>`).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Super AI Sentinel</title>
      <style>${style}</style>
    </head>
    <body>
      <h2>🚀 Super AI Sentinel - Powerful Code Wizard</h2>
      <div id="chat"></div>
      <select id="model">${modelSelect}</select>
      <input type="text" id="input" placeholder="Ask me to build powerful code... e.g., React todo app" />
      <button onclick="sendMessage()">Send 🚀</button>
      <script>
        const vscode = acquireVsCodeApi();
        let messages = [];

        function addMessage(content, isUser) {
          messages.push({ content, isUser });
          const chat = document.getElementById('chat');
          const div = document.createElement('div');
          div.className = \`message \${isUser ? 'user' : 'ai'}\`;
          if (content.includes('\\n```')) {
            div.classList.add('code');
          }
          div.innerHTML = content.replace(/\\n/g, '<br>');
          chat.appendChild(div);
          chat.scrollTop = chat.scrollHeight;
        }

        function sendMessage() {
          const input = document.getElementById('input');
          const model = document.getElementById('model').value;
          const prompt = input.value;
          if (!prompt) return;
          addMessage(prompt, true);
          vscode.postMessage({ type: 'prompt', payload: prompt, model });
          input.value = '';
        }

        // Listen for responses from extension
        window.addEventListener('message', event => {
          const message = event.data;
          switch (message.type) {
            case 'response':
              addMessage(message.payload, false);
              break;
            case 'actionExecuted':
              addMessage(\`✅ \${message.payload}\`, false);
              break;
            case 'error':
              addMessage(\`❌ \${message.payload}\`, false);
              break;
          }
        });

        // Enter to send
        document.getElementById('input').addEventListener('keypress', e => {
          if (e.key === 'Enter') sendMessage();
        });
      </script>
    </body>
    </html>`;
  }

  private static getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [extensionUri]
    };
  }

  public dispose() {
    AISentinelWebview.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
