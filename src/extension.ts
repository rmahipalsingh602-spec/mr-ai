import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { AISentinelWebview } from './webview';
import type { Action, WebviewMessage, ModelOption } from './types';

const OLLAMA_ENDPOINT = 'http://localhost:11434/api/generate';
const MAX_RETRIES = 3;
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.vscode']);

let currentModel = 'deepseek-coder-v2';  // Default powerful model

/**
 * Recursively builds workspace tree structure.
 */
function getWorkspaceTree(root: string): string {
  let tree = '';
  try {
    const buildTree = (dir: string, prefix: string = ''): string => {
      let result = '';
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.sort((a, b) => a.isDirectory() === b.isDirectory() ? 0 : a.isDirectory() ? -1 : 1);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const entryPath = path.join(dir, entry.name);
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        result += `${prefix}${connector}${entry.name}\n`;
        if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          result += buildTree(entryPath, newPrefix);
        }
      }
      return result;
    };
    tree = buildTree(root);
  } catch (error) {
    tree = 'Could not scan workspace.';
  }
  return `Workspace Tree:\n${tree}`;
}

/**
 * Parse XML actions with extended support.
 */
function parseActions(response: string): Action[] {
  const actions: Action[] = [];
  const fileRegex = /<file\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/gi;
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    actions.push({ name: match[1], content: match[2].trim() } as any);
  }
  const cmdRegex = /<command>([\s\S]*?)<\/command>/gi;
  while ((match = cmdRegex.exec(response)) !== null) {
    actions.push({ command: match[1].trim() } as any);
  }
  // New: <test code="...">
  const testRegex = /<test\s+code=["']([\s\S]*?)["']\s*\/>/gi;
  while ((match = testRegex.exec(response)) !== null) {
    actions.push({ code: match[1].trim(), timeout: 5000 } as any);
  }
  return actions;
}

/**
 * Execute actions and send feedback to webview.
 */
async function executeActions(actions: Action[], rootPath: string, panel: vscode.WebviewPanel | undefined, progress?: vscode.Progress<{ message?: string }>) {
  for (const action of actions) {
    try {
      if ('name' in action && 'content' in action) {
        const fullPath = path.join(rootPath, action.name);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, action.content, 'utf8');
        vscode.window.showTextDocument(vscode.Uri.file(fullPath));
        const msg: WebviewMessage = { type: 'actionExecuted', payload: `Created/Updated ${action.name}` };
        panel?.webview.postMessage(msg);
        progress?.report({ message: msg.payload });
        // Auto-format if prettier installed
        await vscode.commands.executeCommand('editor.action.formatDocument');
      } else if ('command' in action) {
        const terminal = vscode.window.createTerminal({ name: 'AI Sentinel' });
        terminal.show();
        terminal.sendText(action.command);
        const msg: WebviewMessage = { type: 'actionExecuted', payload: `Ran: ${action.command}` };
        panel?.webview.postMessage(msg);
        progress?.report({ message: msg.payload });
      } else if ('code' in action) {
        // Run test code in new file
        const testPath = path.join(rootPath, 'ai-test.js');
        fs.writeFileSync(testPath, action.code);
        const terminal = vscode.window.createTerminal({ name: 'AI Test' });
        terminal.sendText(`node ${testPath}`);
        const msg: WebviewMessage = { type: 'actionExecuted', payload: 'Ran test' };
        panel?.webview.postMessage(msg);
      }
    } catch (error: any) {
      const msg: WebviewMessage = { type: 'error', payload: `Error: ${error.message}` };
      panel?.webview.postMessage(msg);
    }
  }
}

/**
 * Call Ollama with enhanced prompt.
 */
async function callOllama(prompt: string, model: string): Promise<string> {
  const response = await fetch(OLLAMA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `You are Super AI Sentinel, a witty, powerful coding genius using DeepSeek/Code Llama.

Context:
${prompt}

Respond ONLY with XML actions OR helpful code/text. Make it advanced and fun!

Examples:
<file name="src/app.tsx">
import React from 'react';
// Powerful code here
</file>
<command>npm install react</command>

No chit-chat! 🎯`,
      stream: false,
      options: { temperature: 0.3 }  // Slightly creative
    })
  });
  const data = await response.json();
  const fullResponse = data.response || '';
  panel?.webview.postMessage({ type: 'response', payload: fullResponse });
  return fullResponse;
}

export function activate(context: vscode.ExtensionContext) {
  // Register Webview Provider for sidebar
  const provider = new class implements vscode.WebviewViewProvider {
    public resolveWebviewView(webviewView: vscode.WebviewView) {
      AISentinelWebview.createOrShow(context.extensionUri);
      webviewView.webview.html = 'Super AI Sentinel chat loads in panel. Use command or Ctrl+Shift+P.';
    }
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aiSentinelChat', provider)
  );

  // Enhanced command
  const disposable = vscode.commands.registerCommand('mr-ai.askOllama', async (userPrompt?: string, model?: string) => {
    const prompt = userPrompt || await vscode.window.showInputBox({
      prompt: 'Super AI Sentinel: What powerful code to build?',
      placeHolder: 'e.g., Fullstack app, fix bug, deploy script'
    });
    if (!prompt) return;

    model = model || currentModel;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('Open a workspace.');
      return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    const panel = AISentinelWebview.currentPanel?._panel;

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Super AI Sentinel (${model})...`,
      cancellable: true
    }, async (progress, token) => {
      let lastError = '';
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (token.isCancellationRequested) return;

        try {
          progress.report({ message: `Attempt ${attempt}: Scanning...` });
          const tree = getWorkspaceTree(rootPath);
          const response = await callOllama(`${tree}\nUser: ${prompt}`, model);
          const actions = parseActions(response);

          if (actions.length === 0) {
            const msg: WebviewMessage = { type: 'response', payload: response || 'No actions parsed. Try again!' };
            panel?.webview.postMessage(msg);
            return;
          }

          progress.report({ message: 'Executing...' });
          await executeActions(actions, rootPath, panel, progress);
          const msg: WebviewMessage = { type: 'actionExecuted', payload: 'Mission accomplished! 🚀' };
          panel?.webview.postMessage(msg);
          vscode.window.showInformationMessage('Super AI Sentinel: Code deployed!');
          return;
        } catch (error: any) {
          lastError = error.message;
          progress.report({ message: `Retry ${attempt}/${MAX_RETRIES}: ${lastError.slice(0, 50)}` });
        }
      }
      panel?.webview.postMessage({ type: 'error', payload: `Failed after retries: ${lastError}` });
    });
  });

  context.subscriptions.push(disposable, 
    vscode.commands.registerCommand('mr-ai.setModel', async () => {
      const models: ModelOption[] = [
        { id: 'deepseek-coder-v2', name: 'DeepSeek-Coder-v2', powerfulFor: 'complex code' },
        { id: 'codellama', name: 'Code Llama', powerfulFor: 'languages' },
        { id: 'deepseek-coder', name: 'DeepSeek-Coder', powerfulFor: 'reliable' }
      ];
      const choice = await vscode.window.showQuickPick(models.map(m => m.name), { placeHolder: 'Choose model' });
      if (choice) currentModel = models.find(m => m.name === choice)?.id || 'deepseek-coder-v2';
      vscode.window.showInformationMessage(`Model set to ${currentModel}`);
    })
  );
}

export function deactivate() {}
