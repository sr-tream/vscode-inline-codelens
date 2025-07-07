// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const inlineCodelensDecoration = vscode.window.createTextEditorDecorationType({
	after: {
		contentText: "",
		margin: "0 0 0 1em",
		color: new vscode.ThemeColor("editorCodeLens.foreground")
	}
});

async function renderInlineCodeLenses() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const limit = vscode.workspace.getConfiguration('inline-codelens').get<number>('limit', -1);

	let lenses: vscode.CodeLens[];

	if (limit === -1) {
		const allLenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
			'vscode.executeCodeLensProvider',
			editor.document.uri
		);
		lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
			'vscode.executeCodeLensProvider',
			editor.document.uri,
			allLenses.length
		);
	} else {
		lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
			'vscode.executeCodeLensProvider',
			editor.document.uri,
			limit
		);
	}

	if (!lenses || lenses.length === 0) {
		setTimeout(renderInlineCodeLenses, 500);
		return;
	}

	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		editor.document.uri
	);

	const functionsAndMethods: vscode.DocumentSymbol[] = [];
	function collectFunctions(symbolList: vscode.DocumentSymbol[]) {
		for (const symbol of symbolList) {
			if (symbol.kind === vscode.SymbolKind.Constructor || symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
				functionsAndMethods.push(symbol);
			}
			if (symbol.children) {
				collectFunctions(symbol.children);
			}
		}
	}
	if (symbols) {
		collectFunctions(symbols);
	}

	const decorations: vscode.DecorationOptions[] = [];
	const lensesByRange = new Map<string, vscode.CodeLens[]>();

	// Group lenses by range
	lenses.forEach(lens => {
		const rangeKey = JSON.stringify(lens.range);
		if (!lensesByRange.has(rangeKey)) {
			lensesByRange.set(rangeKey, []);
		}
		lensesByRange.get(rangeKey)!.push(lens);
	});

	lensesByRange.forEach((lineLenses, rangeKey) => {
		const line = lineLenses[0].range;
		const titles = lineLenses.map(lens => lens.command?.title || "⤵️").join(' | ');
		const commandLinks = lineLenses.map(lens => {
			if (!lens.command) return '';
			const title = lens.command.title || "⤵️";
			if (lens.command.command !== 'editor.action.showReferences') {
				return `[${title}](command:${lens.command.command}?${encodeURIComponent(JSON.stringify(lens.command.arguments || []))})`;
			} else {
				const command = 'inline-codelens.showReferencesWrapper';
				const commandArgs = [
					lens.command.command,
					...(lens.command.arguments || [])
				];
				return `[${title}](command:${command}?${encodeURIComponent(JSON.stringify(commandArgs))})`;
			}
		}).join(' | ');

		const hoverMessage = new vscode.MarkdownString(commandLinks);
		hoverMessage.isTrusted = true;

		let range = lineLenses[0].range;
		const isFunctionLine = functionsAndMethods.some(symbol => symbol.range.start.line === line.start.line);

		if (isFunctionLine) {
			const lineEndPosition = editor.document.lineAt(line.end.line).range.end;
			range = new vscode.Range(range.start, lineEndPosition);
		}

		const fontDecoration = vscode.workspace.getConfiguration('inline-codelens').get<string>('fontDecoration', 'font-size: 0.75em;');
		decorations.push({
			range: range,
			renderOptions: {
				after: {
					contentText: titles,
					color: new vscode.ThemeColor('editorCodeLens.foreground'),
					textDecoration: `none; ${fontDecoration}`,
				},
			},
			hoverMessage: hoverMessage
		});
	});

	editor.setDecorations(inlineCodelensDecoration, decorations);
}


function debounce(func: (...args: any[]) => void, wait: number) {
	let timeout: NodeJS.Timeout | undefined;
	return function executedFunction(...args: any[]) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
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

	const debounceDelay = vscode.workspace.getConfiguration('inline-codelens').get<number>('debounceDelay', 300);
	const debouncedRender = debounce(renderInlineCodeLenses, debounceDelay);

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

	// Register change handlers
	vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document === vscode.window.activeTextEditor?.document) {
			debouncedRender(); // Refresh on edit
		}
	});

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) renderInlineCodeLenses(); // Refresh when switching files
	});
	renderInlineCodeLenses();
}

// This method is called when your extension is deactivated
export function deactivate() { }
