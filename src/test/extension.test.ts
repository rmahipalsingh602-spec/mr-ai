import * as assert from 'assert';
import * as vscode from 'vscode';

suite('AI Sentinel Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Should have the AI Sentinel command registered', async () => {
        // The extension should be activated by the test runner
        const commands = await vscode.commands.getCommands(true);
        const sentinelCommand = commands.find(cmd => cmd === 'ai-sentinel.run');
        assert.ok(sentinelCommand, 'The "ai-sentinel.run" command should be registered.');
    });

    test('Sample test to ensure test suite runs', () => {
        // This is a placeholder to ensure the suite is configured correctly.
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});
