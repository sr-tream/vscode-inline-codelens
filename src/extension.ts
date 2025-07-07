import * as vscode from 'vscode';
import { DecorationProvider } from './decorationProvider';
import { InlineCodeLensInlayHintsProvider } from './inlayHintsProvider';

export function activate(context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('editor');
	if (config.get('codeLens')) {
		vscode.window.showInformationMessage('The built-in CodeLens is enabled. Do you want to disable it for a better experience with Inline CodeLens?', 'Disable built-in CodeLens', 'Hide')
			.then(selection => {
				if (selection === 'Disable built-in CodeLens') {
					config.update('codeLens', false, vscode.ConfigurationTarget.Global);
				}
			});
	}

	let provider: vscode.Disposable | DecorationProvider;

	function updateProvider() {
		if (provider) {
			if ('dispose' in provider) {
				provider.dispose();
			}
		}

		const providerName = vscode.workspace.getConfiguration('inline-codelens').get<string>('provider');
		if (providerName === 'Inlay Hints') {
			const inlayHintsProvider = new InlineCodeLensInlayHintsProvider();
			provider = vscode.languages.registerInlayHintsProvider({ scheme: 'file' }, inlayHintsProvider);
			context.subscriptions.push(inlayHintsProvider);
		} else {
			provider = new DecorationProvider();
		}
	}

	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('inline-codelens.provider')) {
			updateProvider();
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand('inline-codelens.showReferencesWrapper',
		(...args: any[]) => {
			const [command, ...commandArgs] = args;
			let finalArgs = commandArgs;

			try {
				const uri = vscode.Uri.from(commandArgs[0]);
				const position = new vscode.Position(commandArgs[1].line, commandArgs[1].character);
				const locations = commandArgs[2].map((loc: any, index: number) => {
					const range = loc.range;
					let start, end;
					if (Array.isArray(range) && range.length === 2) {
						start = range[0];
						end = range[1];
					} else if (range && (range.start || range._start) && (range.end || range._end)) {
						start = range.start || range._start;
						end = range.end || range._end;
					} else {
						throw new Error(`Unexpected range format in location ${index}`);
					}
					return new vscode.Location(
						vscode.Uri.from(loc.uri),
						new vscode.Range(
							new vscode.Position(start.line, start.character),
							new vscode.Position(end.line, end.character)
						)
					);
				});
				finalArgs = [uri, position, locations];
			} catch (e) {
				console.error("Failed to reconstruct arguments for editor.action.showReferences", e);
			}
			vscode.commands.executeCommand(command, ...finalArgs);
		}
	));

	updateProvider();
}

export function deactivate() { }
