import { Language, PyodideInterface, WindowWithExtensions } from "../types";
import { Runner } from "./runner";

/**
 * Uses pyodine to run python in the browser
 */
export class PythonRunner implements Runner {
  static language = "python";
  public initialized: boolean = false;

  /** Internal pyodide interface */
  private pyodide: PyodideInterface | null = null;

  async init(dataset: string) {
    if (this.initialized) return;

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";
      script.onload = () => resolve(null);
      script.onerror = reject;
      document.head.appendChild(script);
    });

    const win = window as WindowWithExtensions;

    if (!win.loadPyodide) {
      throw new Error("Pyodide loader not found");
    }

    this.pyodide = await win.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
    });

    if (this.pyodide == null) {
      throw new Error("Failed to initialize Pyodide");
    }

    this.pyodide.runPython(`
  import sys
  import io
  sys.stdout = io.StringIO()
  sys.stderr = io.StringIO()
      `);

    this.pyodide.globals.set("dataset", dataset);

    this.initialized = true;
  }

  public getSkeleton(): string {
    const dataset = this.pyodide?.globals.get("dataset");
    const lines = dataset.trim().split("\n");
    const firstLine = lines[0];
    const hasCommas = firstLine.includes(",");
    const hasTabs = firstLine.includes("\t");

    if (hasCommas || hasTabs) {
      const separator = hasTabs ? "\\t" : ",";
      return `import pandas as pd
import io
      
# Dataset is pre-loaded in 'dataset' variable. Uncomment to view: 
# print(dataset[:200])
      
# Load into pandas DataFrame
df = pd.read_csv(io.StringIO(dataset), sep='${separator}')
      
print("Dataset shape:", df.shape)
print(df.head())
      
# Your analysis code here`;
    }

    return `# Dataset is pre-loaded in 'dataset' variable. Uncomment to view: 
# print(dataset[:200])
      
# Your analysis code here`;
  }

  async *run(code: string) {
    if (!this.pyodide) {
      yield {
        text: "Python not loaded yet. Please wait...",
        type: "error" as const,
      };
      return;
    }

    try {
      this.pyodide.runPython(`
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
    `);

      const result = await this.pyodide.runPythonAsync(code);
      const stdout = this.pyodide.runPython("sys.stdout.getvalue()");
      const stderr = this.pyodide.runPython("sys.stderr.getvalue()");

      yield {
        text: ">>> Running code...",
        type: "success" as const,
      };

      if (stderr) {
        yield {
          text: stderr,
          type: "error" as const,
        };
      }

      if (result !== undefined && result !== null) {
        yield {
          text: `Result: ${result}`,
          type: null,
        };
      }

      if (stdout) {
        yield {
          text: `Result: ${stdout}`,
          type: null,
        };
      }

      yield {
        text: ">>> Done.",
        type: "success" as const,
      };
      return;
    } catch (error) {
      yield {
        text: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        type: "error" as const,
      };
      return;
    }
  }
}
