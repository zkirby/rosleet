# Rosalind LeetCode Style with Python REPL

A Tampermonkey userscript that transforms Rosalind.info into a LeetCode-style interface with an integrated Python REPL powered by Pyodide and CodeMirror 6.

## Features

- 🎨 **LeetCode-inspired UI** - Clean, modern interface with split-pane layout
- 🐍 **Python REPL** - Run Python code directly in the browser using Pyodide
- ✨ **Syntax Highlighting** - Full Python syntax highlighting with CodeMirror 6
- 🔧 **Auto-indentation** - Smart indentation for Python code
- 📦 **Dataset Loading** - One-click dataset import into the REPL
- ⌨️ **Keyboard Shortcuts** - Ctrl/Cmd+Enter to run code

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Setup

1. Install dependencies:
```bash
npm install
```

2. Build the userscript:
```bash
npm run build
```

3. Watch for changes during development:
```bash
npm run watch
```

### Project Structure

```
├── src/
│   └── index.ts          # Main TypeScript source
├── dist/
│   └── *.user.js         # Built userscript (paste into Tampermonkey)
├── rollup.config.js      # Rollup bundler configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project dependencies
```

### Building for Production

Run the build command:
```bash
npm run build
```

The compiled userscript will be in `dist/rosalind-leetcode-style.user.js` and will be **automatically copied to your clipboard**! Just paste it directly into Tampermonkey.

If you want to build without copying to clipboard:
```bash
npm run build:nocp
```

## Code Organization

The TypeScript source is organized into logical sections:

- **Type Definitions** - TypeScript interfaces and types
- **Global State** - Module-level state variables
- **Styles** - CSS styling
- **Utility Functions** - Helper functions for UI updates
- **External Libraries** - Script loaders for CodeMirror and Pyodide
- **CodeMirror Editor** - Editor initialization and management
- **Pyodide/Python REPL** - Python runtime initialization and execution
- **Layout & UI** - Split-pane layout and resizing
- **Dataset Loading** - Rosalind dataset integration
- **Main Initialization** - Entry point and setup

## Usage

1. Install Tampermonkey in your browser
2. Create a new userscript
3. Paste the contents of `dist/rosalind-leetcode-style.user.js`
4. Navigate to any Rosalind.info problem page
5. Use the Python REPL on the right side of the screen

### Keyboard Shortcuts

- `Ctrl+Enter` (or `Cmd+Enter` on Mac) - Run code
- `Tab` - Indent/Auto-complete

## License

MIT
