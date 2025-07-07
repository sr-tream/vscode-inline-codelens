# Inline CodeLens README

This extension displays CodeLenses inline, at the end of the line, providing a less intrusive way to view code information.

## Features

- Displays CodeLenses inline.
- When the built-in `editor.codeLens` is enabled, it prompts the user to disable it for a better experience.
- Customizable limit for the number of CodeLenses to display.
- Debounce mechanism to improve performance on document changes.
- Customizable font decoration for the CodeLenses.

## Extension Settings

This extension contributes the following settings:

* `inline-codelens.limit`: The maximum number of CodeLenses to show. Set to `-1` for no limit.
* `inline-codelens.debounceDelay`: The debounce delay in milliseconds for refreshing CodeLenses on document change.
* `inline-codelens.fontDecoration`: The CSS text decoration to apply to the inline CodeLenses.

## Release Notes

See the [CHANGELOG.md](CHANGELOG.md) file for details on each release.

**Enjoy!**
