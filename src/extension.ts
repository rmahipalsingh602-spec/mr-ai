import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

const OLLAMA_ENDPOINT = 'http://localhost:11434/api/generate';
const MAX_RETRIES = 2;
const IGNORED_DIRS = new Set(['node_modules', '.git']);

interface FileAction {
  name: string;
  content: string;
}

interface CommandAction {
  command: string;
}

/**
 * Recursively builds workspace tree structure, ignoring specified directories.
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
  return `Workspace Tree:
${tree}`;
}

/**
 * Parse XML actions from LLM response using robust regex.
 */
function parseActions(response: string): (FileAction | CommandAction)[] {
  const actions: (FileAction | CommandAction)[] = [];
  // File tags: <file name="path">content</file>
  const fileRegex = /<file\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/gi;
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    actions.push({ name: match[1], content: match[2].trim() } as FileAction);
  }
  // Command tags: <command>cmd</command>
  const cmdRegex = /<command>([\s\S]*?)<\/command>/gi;
  while ((match = cmdRegex.exec(response)) !== null) {
    actions.push({ command: match[1].trim() } as CommandAction);
  }
  return actions;
}

/**
 * Execute parsed actions safely.
 */
async function executeActions(actions: (FileAction | CommandAction)[], rootPath: string, progress: vscode.Progress<{ message?: string }>) {
  for (const action of actions) {
    if ('name' in action && 'content' in action) {
      const fullPath = path.join(rootPath, action.name);
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      const safeContent = (action.content as string) || '';
      fs.writeFileSync(fullPath, safeContent, 'utf8');
      vscode.window.showTextDocument(vscode.Uri.file(fullPath));
      progress.report({ message: `Created/Updated: ${action.name}` });
    } else if ('command' in action) {
      const terminal = vscode.window.createTerminal({ name: 'AI Sentinel' });
      terminal.show();
      terminal.sendText((action.command as string) || '');
      progress.report({ message: `Executed: ${action.command}` });
    }
  }
}

/**
 * Call Ollama with prompt.
 */
async function callOllama(prompt: string): Promise<string> {
  const response = await fetch(OLLAMA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-coder',
      prompt,
      stream: false,
      options: { temperature: 0.1 }
    })
  });
  const data = await response.json();
  return data.response || '';
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('mr-ai.askOllama', async () => {
    const userPrompt = await vscode.window.showInputBox({
      prompt: 'AI Sentinel: What do you want to build or change?',
      placeHolder: 'e.g., Create a login page, npm install'
    });
    if (!userPrompt) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('Open a workspace folder.');
      return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'AI Sentinel Active...',
      cancellable: true
    }, async (progress, token) => {
      let lastError = '';
      for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        if (token.isCancellationRequested) return;

        try {
          progress.report({ message: `Attempt ${attempt}: Gathering context...` });
          const tree = getWorkspaceTree(rootPath);
          const systemPrompt = `You are AI Sentinel, autonomous coding agent.

${tree}

User: ${userPrompt}

RESPOND ONLY WITH XML ACTIONS. No other text!
<file name="src/example.js">console.log("Hello");</file>
<command>npm run dev</command>

${lastError ? `PREVIOUS ERROR: ${lastError}. Fix and use ONLY valid XML.` : ''}`;

          progress.report({ message: 'Calling Ollama...' });
          const response = await callOllama(systemPrompt);
          const actions = parseActions(response);

          if (actions.length === 0) {
            throw new Error('No valid XML actions found. Use <file name="path">content</file> or <command>cmd</command>.');
          }

          progress.report({ message: 'Executing...' });
          await executeActions(actions, rootPath, progress);
          vscode.window.showInformationMessage('AI Sentinel: Mission accomplished!');
          return;
        } catch (error: any) {
          lastError = error.message;
          progress.report({ message: `Retry ${attempt}/${MAX_RETRIES + 1}: ${lastError.slice(0, 50)}...` });
          if (attempt > MAX_RETRIES) {
            vscode.window.showErrorMessage(`AI Sentinel failed: ${lastError}`);
          }
        }
      }
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
