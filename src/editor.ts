import { $, $$ } from "./$";
import { DB } from "./db";
import { JavaScriptRunner } from "./executors/javascript";
import { PythonRunner } from "./executors/python";
import { Runner } from "./executors/runner";
import {
  EditorElements,
  Language,
  OutputType,
  PyodideInterface,
  StatusState,
  WindowWithExtensions,
} from "./types";

const TextToState: Record<StatusState, string> = {
  loading: "Loading",
  ready: "Ready",
  error: "Error",
};

/**
 * Generic editor class abstraction over CodeMirror and Pyodide
 */
export class Editor {
  private view: any; // EditorView from CodeMirror
  private dataset: string = "";
  // In a given session, if ths user switches languages multiple times
  // avoid re-initing the runner;
  private _runnerCache: Record<Language, Runner> = {
    python: new PythonRunner(),
    javascript: new JavaScriptRunner(),
  };

  constructor(private elements: EditorElements) {}

  async init(): Promise<void> {
    try {
      // Setup CodeMirror
      await new Promise((resolve, reject) => {
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
      });

      // Set up the language
      const { languageSelector } = this.elements;
      languageSelector.value = this.language;
      languageSelector.addEventListener("change", (e) => {
        const target = e.target as HTMLSelectElement;
        this.language = target.value as Language;
      });
      // reset the editor with the new language
      this.reset();

      // Set up cntrl buttons
      const { runBtn, clearBtn, submitBtn, output } = this.elements;
      runBtn.addEventListener("click", this.run);
      clearBtn.addEventListener("click", this.clear);
      submitBtn.addEventListener("click", this.submit);
    } catch (e) {
      console.error(e);
      this.status = "error";
      return;
    }
  }

  get content(): string {
    if (!this.view) throw new Error("Editor not initialized");
    return this.view.state.doc.toString();
  }

  set content(text: string) {
    if (!this.view) throw new Error("Editor not initialized");
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: text,
      },
    });
  }

  get language(): Language {
    return DB.get(DB.KEYS.LANGUAGE_PREFERENCE, "python");
  }

  set language(language: Language) {
    // Update language
    DB.save(DB.KEYS.LANGUAGE_PREFERENCE, language);

    // Reset the editor
    this.reset();
  }

  private async initRunner() {
    const dataset = this.dataset;
    if (dataset == null) {
      console.log("no dataset loaded yet, skipping runner initialization");
      return;
    }
    if (!this.runner.initialized) {
      await this.runner.init(dataset);
    }
  }

  private get runner() {
    return this._runnerCache[this.language];
  }

  clear() {
    this.elements.output.innerHTML = "";
  }

  /** Run the code in the editor */
  async run() {
    const runner = this.runner;
    if (runner == null) {
      this.addOutput("Editor hasn't finished loading yet...", "error");
      return;
    }
    const code = this.getLastOutput();
    if (code.trim() == "") {
      this.addOutput("Nothing to run...", "error");
      return;
    }

    const { runBtn } = this.elements;
    runBtn.disabled = true;
    runBtn.textContent = "Running...";
    this.clear();

    try {
      for await (const { type, text } of runner.run(code)) {
        this.addOutput(text, type);
      }
    } catch (error) {
      this.addOutput(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
      return;
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = "Run Code";
    }
  }

  /** Start the problem in the editor */
  async start(dataset: string) {
    this.dataset = dataset;

    await this.initRunner();

    this.content = this.runner!.getSkeleton();
    this.addOutput("✓ Dataset loaded! Ready to analyze.", "success");
  }

  /** reset the editor after a language change */
  private async reset() {
    this.status = "loading";
    try {
      const win = window as WindowWithExtensions;
      if (!win.CodeMirrorSetup) {
        throw new Error("CodeMirror not loaded");
      }

      // Remove the old editor if there is one
      if (this.view) this.view.destroy();

      const {
        EditorView,
        basicSetup,
        python,
        javascript,
        indentUnit,
        keymap,
        indentWithTab,
      } = win.CodeMirrorSetup;

      const defaultDocs: Record<Language, string> = {
        python: "# Click 'start ▶︎' to start the challenge...\n",
        javascript: "// Click 'start ▶︎' to start the challenge...\n",
      };
      const extension: Record<Language, () => void> = {
        python,
        javascript,
      };

      const runCodeKeymap = keymap.of([
        indentWithTab,
        {
          key: "Ctrl-Enter",
          mac: "Cmd-Enter",
          run: this.run,
        },
      ]);

      // Load saved code if available, otherwise use provided initialDoc or default
      const savedCode = DB.get(`${DB.KEYS.CODE}${this.language}`);
      const docToUse = savedCode || defaultDocs[this.language];

      // Create update listener to save code on changes
      const saveOnUpdate = EditorView.updateListener.of((update: any) => {
        if (update.docChanged) {
          const code = update.state.doc.toString();
          DB.save(DB.KEYS.CODE, code);
        }
      });

      // Initialize the new runner if needed
      await this.initRunner();

      // Reset the view
      this.view = new EditorView({
        doc: docToUse,
        extensions: [
          basicSetup,
          extension[this.language](),
          indentUnit.of("    "),
          runCodeKeymap,
          saveOnUpdate,
          EditorView.theme({
            "&": {
              height: "100%",
              backgroundColor: "#1e1e1e",
            },
            ".cm-scroller": {
              overflow: "auto",
            },
          }),
        ],
        parent: this.elements.codeInput,
      });
    } catch (e) {
      console.error(e);
      this.status = "error";
      return;
    }
    this.status = "ready";
  }

  /** Update the editors status */
  set status(state: StatusState) {
    const { status } = this.elements;
    status.className = state;
    const text = $(status).byQuery("#rosalind-repl-status-text");
    if (text) text.textContent = TextToState[state];
  }

  addOutput(text: string, type: OutputType | null = null) {
    const { output } = this.elements;
    const line = $$.DIV({
      content: text,
      classList: [
        "rosalind-output-line",
        type === "error"
          ? "rosalind-output-error"
          : type === "success"
          ? "rosalind-output-success"
          : "",
      ],
    });
    output.appendChild(line.el);
    output.scrollTop = output.scrollHeight;
  }

  getLastOutput() {
    const { output } = this.elements;
    const lines = $(output).queryAll(".rosalind-output-line");

    // Find the last ">>> Running code..." marker
    let startIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].textContent?.includes(">>> Running code...")) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      return "";
    }

    // Collect lines between ">>> Running code..." and ">>> Done."
    const outputLines: string[] = [];
    for (let i = startIndex + 1; i < lines.length; i++) {
      const text = lines[i].textContent || "";

      // Stop at ">>> Done." marker
      if (text.includes(">>> Done.")) {
        break;
      }

      // Skip error lines and result lines
      if (
        !lines[i].classList.contains("rosalind-output-error") &&
        !text.startsWith("Result:")
      ) {
        outputLines.push(text);
      }
    }

    return outputLines.join("\n").trim();
  }

  submit() {
    const output = this.getLastOutput();
    if (!output) {
      this.addOutput("No output to submit. Run your code first.", "error");
      return;
    }

    try {
      const form = $$.byId<HTMLFormElement>("id_form_submission");
      const input = $$.byId<HTMLInputElement>("id_output_file");

      if (!form || !input) {
        throw new Error("Submission form or file input not found");
      }

      // Create a File object from the output string
      const blob = new Blob([output], { type: "text/plain" });
      const file = new File([blob], "output.txt", { type: "text/plain" });

      // Create a DataTransfer to set the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      // Submit the form
      form.submit();
      this.addOutput("✓ Output submitted successfully!", "success");
    } catch (error) {
      this.addOutput(
        `Failed to submit: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    }
  }
}
