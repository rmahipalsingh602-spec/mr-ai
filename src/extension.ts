import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('mr-ai.askOllama', async () => {
        
        const userPrompt = await vscode.window.showInputBox({
            prompt: 'Ask AI Sentinel to build something...',
            placeHolder: 'e.g. Create a dark mode login page'
        });

        if (!userPrompt) return;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "AI Sentinel is writing code (Anti-Crash Mode)...",
            cancellable: false
        }, async (progress) => {
            try {
                // Naya Prompt: No JSON, Only File Tags!
                const fullPrompt = `You are an expert AI coder. The user wants: "${userPrompt}".
DO NOT USE JSON. You must output the files using this exact format for EVERY file:

[FILE: filename.ext]
code goes here
[/FILE]

Example:
[FILE: index.html]
<!DOCTYPE html>
<html><body><h1>Hello</h1></body></html>
[/FILE]
[FILE: style.css]
body { background: black; }
[/FILE]

Write the code now. Do not write any other text outside these tags.`;

                const response = await fetch('http://localhost:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'deepseek-coder',
                        prompt: fullPrompt,
                        stream: false,
                        options: {
                            num_predict: 4000,
                            temperature: 0.2
                        }
                    })
                });

                const data: any = await response.json();
                const aiResponse = data.response;

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    vscode.window.showErrorMessage('Please open a folder first.');
                    return;
                }
                const rootPath = workspaceFolders[0].uri.fsPath;

                // --- NEW MAGIC BULLET: Regex Extractor ---
                // Yeh code JSON strictness ke bina file name aur content nikal lega
                const fileRegex = /\[FILE:\s*(.+?)\]([\s\S]*?)\[\/FILE\]/g;
                let match;
                let filesCreated = 0;
                let firstFilePath = null;

                while ((match = fileRegex.exec(aiResponse)) !== null) {
                    const filename = match[1].trim();
                    const content = match[2].trim();
                    
                    if (filename && content) {
                        const fullPath = path.join(rootPath, filename);
                        const directory = path.dirname(fullPath);

                        if (!fs.existsSync(directory)) {
                            fs.mkdirSync(directory, { recursive: true });
                        }

                        fs.writeFileSync(fullPath, content);
                        filesCreated++;
                        
                        if (!firstFilePath) firstFilePath = fullPath;
                    }
                }

                if (filesCreated === 0) {
                    // Agar AI ne tag format use nahi kiya, toh raw output save kar do
                    const rawPath = path.join(rootPath, 'ai_raw_output.txt');
                    fs.writeFileSync(rawPath, aiResponse);
                    vscode.window.showWarningMessage('AI format error. Saved as raw text file instead.');
                } else {
                    vscode.window.showInformationMessage(`Success! AI Sentinel created ${filesCreated} file(s) without errors.`);
                    
                    // Open the first generated file
                    if (firstFilePath) {
                        const document = await vscode.workspace.openTextDocument(firstFilePath);
                        await vscode.window.showTextDocument(document);
                    }
                }

            } catch (error) {
                vscode.window.showErrorMessage(`System Error: ${error}`);
            }
        });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}