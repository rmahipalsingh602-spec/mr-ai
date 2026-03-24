import * as vscode from 'vscode';

/**
 * Extended actions for Super AI Sentinel.
 */
export interface FileAction {
  name: string;
  content: string;
}

export interface CommandAction {
  command: string;
}

export interface TestAction {
  code: string;
  timeout?: number;
}

export interface RefineAction {
  error: string;
}

export type Action = FileAction | CommandAction | TestAction | RefineAction;

/**
 * Webview messages between extension and webview.
 */
export interface WebviewMessage {
  type: 'prompt' | 'response' | 'actionExecuted' | 'error';
  payload: string;
  model?: string;  // e.g., 'deepseek-coder-v2', 'codex'
}

export interface ModelOption {
  id: string;
  name: string;
  powerfulFor: string;  // e.g., 'code generation'
}
