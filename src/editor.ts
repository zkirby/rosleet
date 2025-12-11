import { DB } from "./db";

/**
 * Generic editor class abstraction over CodeMirror and Pyodide
 */
export class Editor {
  constructor() {}

  static async init(): Promise<void> {
    await Promise.all([
      // Pyodide
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";
        script.onload = () => resolve(null);
        script.onerror = reject;
        document.head.appendChild(script);
      }),
      // CodeMirror
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.type = "module";
        script.textContent = `
          import { EditorView, basicSetup } from 'https://esm.sh/codemirror@6.0.1';
          import { python } from 'https://esm.sh/@codemirror/lang-python@6.1.3';
          import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6.2.1';
          import { indentUnit } from 'https://esm.sh/@codemirror/language@6.9.0';
          import { keymap } from 'https://esm.sh/@codemirror/view@6.21.0';
          import { indentWithTab } from 'https://esm.sh/@codemirror/commands@6.3.0';
    
          window.CodeMirrorSetup = { EditorView, basicSetup, python, javascript,  indentUnit, keymap, indentWithTab };
          window.dispatchEvent(new Event('codemirror-loaded'));
        `;

        window.addEventListener("codemirror-loaded", () => resolve(null), {
          once: true,
        });
        script.onerror = reject;
        document.head.appendChild(script);
      }),
    ]);
  }

  /** Return the skeleton starter code */
  static getSkeleton(dataset: string): string {
    const language = DB.get(DB.KEYS.LANGUAGE_PREFERENCE, "python");
    const lines = dataset.trim().split("\n");
    const firstLine = lines[0];
    const hasCommas = firstLine.includes(",");
    const hasTabs = firstLine.includes("\t");

    if (language === "python") {
      if (hasCommas || hasTabs) {
        const separator = hasTabs ? "\\t" : ",";
        return `import pandas as pd
      import io
      
      # Dataset is pre-loaded in 'dataset' variable
      # Uncomment to view: print(dataset[:200])
      
      # Load into pandas DataFrame
      df = pd.read_csv(io.StringIO(dataset), sep='${separator}')
      
      print("Dataset shape:", df.shape)
      print(df.head())
      
      # Your analysis code here
      `;
      }

      return `# Dataset is pre-loaded in 'dataset' variable
      # Uncomment to view: print(dataset[:200])
      
      # Your analysis code here
      `;
    } else {
      if (hasCommas || hasTabs) {
        const separator = hasTabs ? "\\t" : ",";
        return `// Dataset is pre-loaded in 'dataset' variable
// Uncomment to view: console.log(dataset.substring(0, 200))

// Parse CSV/TSV
const lines = dataset.trim().split('\\n');
const data = lines.map(line => line.split('${separator}'));

console.log('Dataset shape:', data.length, 'rows');
console.log('First few rows:', data.slice(0, 5));

// Your analysis code here
`;
      }

      return `// Dataset is pre-loaded in 'dataset' variable
// Uncomment to view: console.log(dataset.substring(0, 200))

// Your analysis code here
`;
    }
  }
}
