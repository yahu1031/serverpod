
import { execSync } from 'child_process';
import { coerce, satisfies } from 'semver';
import { ExtensionContext, Hover, languages, window } from 'vscode';
import {
	DocumentSelector,
	LanguageClient,
	LanguageClientOptions,
	RevealOutputChannelOn,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	let output;
	const ds: DocumentSelector = [{ language: 'yaml'}, { language: 'Spy'}, { language: 'Serverpod yaml'}];
	languages.registerHoverProvider(ds, {
        provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position);
			const word = document.getText(range);
			const isKey = /^\s*([^#]*?):/.test(word);
			/* 
			 * get the line and remove part till the word
			 * `name: String relation(name = usr_address, field = addressId)`
			 *  -> ` String relation(name = usr_address, field = addressId)` 
			 *  -> ` String` -> `String`
			 */
			const dataType = document.lineAt(position.line).text.split(word)[1].trim().split(' ')[0].trim();
            if (!range || word.startsWith('#') || !isKey) {
                return undefined;
            }

            // Extract the word
            // const isValue = !isKey && /^\s*[^#:]+:\s*(.+)?$/.test(word);
			// console.log(`---------- ${word} is Key: ${isKey} ----------`);
			// console.log(`---------- ${word} is Value: ${isValue} ----------`);
            // Get the line number of the current position
            const lineNumber = position.line;

            // Extract the comment right above the word
            let comment = '';
            for (let i = lineNumber - 1; i >= 0; i--) {
                const line = document.lineAt(i).text.trim();
				if (line === '') {
					// Stop if an empty line is encountered
					break;
				}
				if (line.startsWith('#')) { 
					comment = comment.substring(1).trim();
				}
				// if any line does not start with a #, don't consider it a comment
				if (!line.startsWith('#')) {
					break;
				}
                comment = line + '\n' + comment;
			}
			// substring to remove the first character, which is a #
			// also check if the first character is a #, otherwise we have a comment on the same line as the word
			if (comment.charAt(0) === '#')
			{
				comment = comment.substring(1).trim();
			}
			if (dataType !== undefined || dataType !== '') {
				const nullableDataType = dataType.endsWith('?') ? `${dataType.slice(0, -1)} || Null` : dataType;
				comment = comment + '\n' + `\`\`\`dart\n${nullableDataType}\n\`\`\``;
			}

			return new Hover(comment);
        }
    });
	try {
		output = execSync('serverpod version');
	} catch (e) {
		window.showErrorMessage('Failed to resolve the Serverpod CLI executable. Please ensure the Serverpod CLI is installed and available on the PATH used by VS Code.');
		return;
	}

	if (!validVersion(output.toString().trim())) {
		window.showErrorMessage('The Serverpod CLI version is outdated. Please upgrade to the latest version (minimum required version is 1.2).');
		return;
	}

	const serverOptions: ServerOptions = {
		command: 'serverpod',
		args: ['language-server'],
		options: {
			env: process.env,
			shell: true,
		},
		transport: TransportKind.stdio
	};

	const clientOptions: LanguageClientOptions = {
		revealOutputChannelOn: RevealOutputChannelOn.Info,
		documentSelector: [
			{ scheme: 'file', language: 'yaml', pattern: '**/protocol/**/*.yaml' },
			{ scheme: 'file', language: 'yaml', pattern: '**/models/**/*.yaml' },
			{ scheme: 'file', pattern: '**/*.spy.yaml' },
			{ scheme: 'file', pattern: '**/*.spy.yml' },
			{ scheme: 'file', pattern: '**/*.spy' },
		],
	};

	client = new LanguageClient(
		'serverpodLanguageServer',
		'Serverpod',
		serverOptions,
		clientOptions
	);

	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}


function validVersion(versionString: string): boolean {
	console.log(versionString);
	const versionTag = versionString.split(':')[1];
	const versionNumber = coerce(versionTag);
	if (versionNumber === null) {
		// If we can't parse the version number, assume it's valid
		// since the version format is valid for all pre 1.2 versions.
		return true;
	}

	return satisfies(versionNumber, '>=1.2.0');
}