import { Language } from "../types";
import { Runner } from "./runner";

/**
 * Runs JavaScript code natively in the browser
 */
export class JavaScriptRunner implements Runner {
  static language = "javascript";
  public initialized: boolean = false;

  async init(dataset: string) {
    (window as any).dataset = dataset;
    // JavaScript runs natively in the browser, no external dependencies needed
    this.initialized = true;
  }

  public getSkeleton(): string {
    const lines = (window as any).dataset.trim().split("\n");
    const firstLine = lines[0];
    const hasCommas = firstLine.includes(",");
    const hasTabs = firstLine.includes("\t");

    if (hasCommas || hasTabs) {
      const separator = hasTabs ? "\\t" : ",";
      return `// Dataset is pre-loaded in 'dataset' variable
// console.log(dataset.substring(0, 200))

// Parse CSV/TSV
const lines = dataset.trim().split('\\n');
const data = lines.map(line => line.split('${separator}'));

console.log('Dataset shape:', data.length, 'rows');
console.log('First few rows:', data.slice(0, 5));

// Your analysis code here`;
    }

    return `// Dataset is pre-loaded in 'dataset' variable
// console.log(dataset.substring(0, 200))

// Your analysis code here`;
  }

  async *run(code: string) {
    if (!this.initialized) {
      yield {
        text: "JavaScript runner not initialized. Please wait...",
        type: "error" as const,
      };
      return;
    }

    try {
      // Capture console output
      const logs: string[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;

      console.log = (...args: any[]) => {
        logs.push(
          args
            .map((arg) =>
              typeof arg === "object"
                ? JSON.stringify(arg, null, 2)
                : String(arg)
            )
            .join(" ")
        );
      };

      console.error = (...args: any[]) => {
        errors.push(args.map((arg) => String(arg)).join(" "));
      };

      console.warn = (...args: any[]) => {
        warnings.push(args.map((arg) => String(arg)).join(" "));
      };

      yield {
        text: ">>> Running code...",
        type: "success" as const,
      };

      try {
        const AsyncFunction = Object.getPrototypeOf(
          async function () {}
        ).constructor;
        // Make dataset available in function scope
        const datasetValue = (window as any).dataset;
        // Prepend code to declare dataset as a const variable
        // This ensures dataset is available as a top-level variable in the code
        const wrappedCode = `const dataset = datasetParam;\n${code}`;
        const fn = new AsyncFunction("datasetParam", wrappedCode);
        const result = await fn(datasetValue);

        // Display console output
        if (logs.length > 0) {
          yield {
            text: logs.join("\n"),
            type: null,
          };
        }

        if (warnings.length > 0) {
          yield {
            text: warnings.join("\n"),
            type: null,
          };
        }

        if (errors.length > 0) {
          yield {
            text: errors.join("\n"),
            type: "error" as const,
          };
        }

        // Display return value if not undefined
        if (result !== undefined && result !== null) {
          yield {
            text: `Result: ${
              typeof result === "object"
                ? JSON.stringify(result, null, 2)
                : String(result)
            }`,
            type: null,
          };
        }

        yield {
          text: ">>> Done.",
          type: "success" as const,
        };
      } catch (error) {
        yield {
          text: `Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          type: "error" as const,
        };
      } finally {
        // Restore console
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
      }
    } catch (error) {
      yield {
        text: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        type: "error" as const,
      };
    }
  }
}
