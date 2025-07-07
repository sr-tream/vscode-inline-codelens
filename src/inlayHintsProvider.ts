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

    constructor() {
        vscode.workspace.onDidChangeTextDocument(() => {
            this.refresh();
        });
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
            const lineEndPosition = document.lineAt(lineLenses[0].range.end.line).range.end;
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

            const hint = new vscode.InlayHint(lineEndPosition, `  ${titles}`);
            hint.paddingLeft = true;
            hint.tooltip = hoverMessage;
            inlayHints.push(hint);
        });

        return inlayHints;
    }
}