import * as vscode from 'vscode';

export async function getCodeLenses(document: vscode.TextDocument): Promise<Map<string, vscode.CodeLens[]>> {
    const limit = vscode.workspace.getConfiguration('inline-codelens').get<number>('limit', -1);

    let lenses: vscode.CodeLens[];;
    if (limit === -1) {
        const allLenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            document.uri
        );
        lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            document.uri,
            allLenses.length
        );
    } else {
        lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            document.uri,
            limit
        );
    }

    const lensesByRange = new Map<string, vscode.CodeLens[]>();
    if (!lenses || lenses.length === 0) {
        return lensesByRange;
    }

    lenses.forEach(lens => {
        const rangeKey = JSON.stringify(lens.range);
        if (!lensesByRange.has(rangeKey)) {
            lensesByRange.set(rangeKey, []);
        }
        lensesByRange.get(rangeKey)!.push(lens);
    });
    return lensesByRange;
}

export async function getFunctionsAndMethods(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
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

    return functionsAndMethods;
}

export function createLensCommand(lens: vscode.CodeLens): string {
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
}