import * as vscode from 'vscode';
import { getCodeLenses, getFunctionsAndMethods, createLensCommand } from './common';

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
        this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(() => {
            this.render();
        }));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
            if (vscode.window.visibleTextEditors.some(e => e.document === event.document)) {
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
        vscode.window.visibleTextEditors.forEach(editor => {
            editor.setDecorations(inlineCodelensDecoration, []);
        });
    }

    private debouncedRender() {
        const debounceDelay = vscode.workspace.getConfiguration('inline-codelens').get<number>('debounceDelay', 300);
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => this.render(), debounceDelay);
    }

    private async render() {
        for (const editor of vscode.window.visibleTextEditors) {
            await this.renderEditor(editor);
        }
    }

    private async renderEditor(editor: vscode.TextEditor) {
        const lensesByRange = await getCodeLenses(editor.document);
        if (!lensesByRange || lensesByRange.size === 0) {
            editor.setDecorations(inlineCodelensDecoration, []);
            return;
        }

        const functionsAndMethods = await getFunctionsAndMethods(editor.document);
        const decorations: vscode.DecorationOptions[] = [];

        lensesByRange.forEach((lineLenses) => {
            const line = lineLenses[0].range;
            const titles = lineLenses.map(lens => lens.command?.title || "⤵️").join(' | ');
            const commandLinks = lineLenses.map(createLensCommand).join(' | ');

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