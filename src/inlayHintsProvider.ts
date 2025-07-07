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

export class InlineCodeLensInlayHintsProvider implements vscode.InlayHintsProvider {
    private _onDidChangeInlayHints: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeInlayHints: vscode.Event<void> = this._onDidChangeInlayHints.event;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(() => {
            this.refresh();
        }));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument((e) => {
            if (vscode.window.visibleTextEditors.some(editor => editor.document === e.document)) {
                this.refresh();
            }
        }));
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
        this._onDidChangeInlayHints.dispose();
    }

    refresh(): void {
        this._onDidChangeInlayHints.fire();
    }

    async provideInlayHints(
        document: vscode.TextDocument,
        range: vscode.Range,
        token: vscode.CancellationToken
    ): Promise<vscode.InlayHint[]> {
        const lenses = await getCodeLenses(document);
        if (token.isCancellationRequested || !lenses || lenses.length === 0) {
            return [];
        }

        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
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

        const inlayHints: vscode.InlayHint[] = [];
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

            const isFunctionLine = functionsAndMethods.some(symbol => symbol.range.start.line === line.start.line);
            let position = line.end;
            if (isFunctionLine) {
                position = document.lineAt(line.end.line).range.end;
            }

            const hint = new vscode.InlayHint(position, `  ${titles}`);
            hint.paddingLeft = true;
            hint.tooltip = hoverMessage;
            inlayHints.push(hint);
        });

        return inlayHints;
    }
}