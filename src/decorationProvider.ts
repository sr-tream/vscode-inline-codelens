import * as vscode from 'vscode';

async function getCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const limit = vscode.workspace.getConfiguration('inline-codelens').get<number>('limit', -1);

    if (limit === -1) {
        const allLenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            document.uri
        );
        return vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            document.uri,
            allLenses.length
        );
    } else {
        return vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            document.uri,
            limit
        );
    }
}

const inlineCodelensDecoration = vscode.window.createTextEditorDecorationType({
    after: {
        contentText: "",
        margin: "0 0 0 1em",
        color: new vscode.ThemeColor("editorCodeLens.foreground")
    }
});

export class DecorationProvider {
    private timeout: NodeJS.Timeout | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) this.render();
        }));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                this.debouncedRender();
            }
        }));
        this.render();
    }

    dispose() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.disposables.forEach(d => d.dispose());
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.setDecorations(inlineCodelensDecoration, []);
        }
    }

    private debouncedRender() {
        const debounceDelay = vscode.workspace.getConfiguration('inline-codelens').get<number>('debounceDelay', 300);
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => this.render(), debounceDelay);
    }

    private async render() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const lenses = await getCodeLenses(editor.document);
        if (!lenses || lenses.length === 0) {
            editor.setDecorations(inlineCodelensDecoration, []);
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

        lenses.forEach(lens => {
            const rangeKey = JSON.stringify(lens.range);
            if (!lensesByRange.has(rangeKey)) {
                lensesByRange.set(rangeKey, []);
            }
            lensesByRange.get(rangeKey)!.push(lens);
        });

        lensesByRange.forEach((lineLenses) => {
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
}