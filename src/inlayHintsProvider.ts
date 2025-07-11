import * as vscode from 'vscode';
import { getCodeLenses, getFunctionsAndMethods, createLensCommand } from './common';

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
        const lensesByRange = await getCodeLenses(document);
        if (token.isCancellationRequested || !lensesByRange || lensesByRange.size === 0) {
            return [];
        }

        const functionsAndMethods = await getFunctionsAndMethods(document);
        const inlayHints: vscode.InlayHint[] = [];

        lensesByRange.forEach((lineLenses) => {
            const line = lineLenses[0].range;
            const parts: vscode.InlayHintLabelPart[] = [];
            lineLenses.forEach(lens => {
                const title = lens.command?.title || "⤵️";
                const part = new vscode.InlayHintLabelPart(` ${title} `);
                part.command = lens.command;
                part.tooltip = title;
                parts.push(part);
            });

            const isFunctionLine = functionsAndMethods.some(symbol => symbol.range.start.line === line.start.line);
            let position = line.end;
            if (isFunctionLine) {
                position = document.lineAt(line.end.line).range.end;
            }

            const hint = new vscode.InlayHint(position, parts);
            hint.paddingLeft = true;
            hint.paddingRight = true;
            inlayHints.push(hint);
        });

        return inlayHints;
    }
}