import { $, $$ } from "./$";
import { DB } from "./db";
import { EditorOverlay } from "./elements/editorOverlay";
import { Problem } from "./problem";
import { JavaScriptRunner } from "./runners/javascript";
import { PythonRunner } from "./runners/python";
import { Runner } from "./runners/runner";
import {
  EditorElements,
  Language,
  OutputType,
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
  private _runnerCache: Record<Language, Runner> = {
    python: new PythonRunner(),
    javascript: new JavaScriptRunner(),
  };
  private timerInterval: number | null = null;
  private overlay!: EditorOverlay;

  constructor(
    private elements: EditorElements,
    private problem: Problem,
    private datasetUrl: string
  ) {}

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
          import { EditorState, Prec } from 'https://esm.sh/@codemirror/state@6.5.3';
    
          window.CodeMirrorSetup = { EditorView, EditorState, Prec, basicSetup, python, javascript,  indentUnit, keymap, indentWithTab  };
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

      // Set up control buttons
      const { runBtn, clearBtn, submitBtn, startBtn } = this.elements;
      const brun = this.run.bind(this);
      const bclear = this.clear.bind(this);
      runBtn.element.addEventListener("click", brun);
      clearBtn.element.addEventListener("click", bclear);
      submitBtn.element.addEventListener("click", this.submit.bind(this));
      startBtn.element.addEventListener("click", this.start.bind(this));

      this.overlay = new EditorOverlay(this.elements.codeInput.parentElement!);

      // Hotkeys
      const keymap: Record<string, () => void> = {
        k: bclear,
        Enter: brun,
      };
      document.addEventListener("keydown", (e) => {
        if (!e.metaKey) return;
        const fn = keymap[e.key];
        if (fn != null) {
          fn();
          e.preventDefault();
        }
      });

      this.setEditor(null, false);
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
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: text,
      },
    });
  }

  get language(): Language {
    return DB.get(["LANGUAGE_PREFERENCE"]) ?? "python";
  }

  set language(language: Language) {
    DB.save(["LANGUAGE_PREFERENCE"], language);
    this.reset();
  }

  private async initRunner() {
    const dataset = this.dataset;
    if (dataset == null) {
      console.log("no dataset loaded yet, skipping runner initialization");
      return;
    }

    await this.runner.init(dataset);
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
    if (!this.problem.isStarted) {
      this.addOutput("Please start before running.", "error");
      return;
    }
    const code = this.content;
    if (code.trim() == "") {
      this.addOutput("Nothing to run...", "error");
      return;
    }

    const { runBtn } = this.elements;
    runBtn.loading();

    try {
      for await (const { type, text } of runner.run(code)) {
        this.addOutput(text, type);
      }
    } catch (error) {
      this.addOutput(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
    }

    runBtn.enable();
  }

  /** Start the problem in the editor */
  async start() {
    const { runBtn, submitBtn, startBtn } = this.elements;
    startBtn.loading();

    if (!this.dataset) {
      const response = await fetch(this.datasetUrl);
      this.dataset = await response.text();
    }

    DB.save(["START_TIMESTAMP"], Date.now());
    this.startTimer();

    await this.reset();

    this.addOutput("✓ Dataset loaded! Ready to analyze.", null);

    runBtn.enable();
    submitBtn.enable();
    startBtn.disable();
  }

  /** Start the 5-minute countdown timer */
  private startTimer() {
    this.stopTimer();

    const { timer, submitBtn, runBtn, startBtn } = this.elements;
    timer.style.display = "flex";

    this.updateTimerDisplay();

    this.timerInterval = window.setInterval(() => {
      this.updateTimerDisplay();

      if (this.problem.remainingSeconds <= 0) {
        this.stopTimer();
        this.addOutput(
          "⏰ Time's up! Please 'start ▶︎' to try again.",
          "error"
        );

        startBtn.enable();
        submitBtn.disable();
        runBtn.disable();
        this.problem.reset();
      }
    }, 1000);
  }

  /** Stop and hide the timer */
  private stopTimer() {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    const { timer } = this.elements;
    timer.style.display = "none";
  }

  /** Update the timer display text */
  private updateTimerDisplay() {
    const { timerText } = this.elements;
    const minutes = Math.floor(this.problem.remainingSeconds / 60);
    const seconds = this.problem.remainingSeconds % 60;
    timerText.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  /** reset the editor */
  private async reset() {
    if (!this.runner.initialized) {
      this.overlay.show();
    }

    await this.initRunner();

    const code = DB.get<string>(["CODE", this.language]);
    const doc = code ?? this.runner.getSkeleton();
    this.setEditor(doc, false);

    this.overlay.hide();
  }

  private async setEditor(doc?: string | null, editable?: boolean) {
    this.status = "loading";

    try {
      const win = window as WindowWithExtensions;
      if (!win.CodeMirrorSetup) {
        throw new Error("CodeMirror not loaded");
      }

      // Remove the old editor if there is one
      if (this.view) this.view.destroy();

      const { EditorView, basicSetup, python, javascript, indentUnit } =
        win.CodeMirrorSetup;

      const defaultDocs: Record<Language, string> = {
        python: "# Click 'start ▶︎' to start the challenge...\n",
        javascript: "// Click 'start ▶︎' to start the challenge...\n",
      };
      const extension: Record<Language, () => void> = {
        python,
        javascript,
      };

      const saveOnUpdate = EditorView.updateListener.of((update: any) => {
        if (update.docChanged) {
          const code = update.state.doc.toString();
          DB.save(["CODE", this.language], code);
        }
      });

      // Reset the view
      this.view = new EditorView({
        doc: doc ?? defaultDocs[this.language],
        extensions: [
          extension[this.language](),
          indentUnit.of("    "),
          basicSetup,
          saveOnUpdate,
          EditorView.editable.of(editable ?? true),
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

  set status(state: StatusState) {
    const { status } = this.elements;
    status.className = state;
    const text = $(status).byQuery("#rosalind-repl-status-text");
    if (text) text.textContent = TextToState[state];
  }

  addOutput(text: string, type: OutputType | null = null) {
    const { output } = this.elements;
    const classList = [
      "rosalind-output-line",
      type === "error"
        ? "rosalind-output-error"
        : type === "success"
        ? "rosalind-output-success"
        : "",
    ].filter((cls) => cls !== "");
    const line = $$.DIV({
      content: text,
      classList,
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
      this.problem.reset();
      // Stop the top-level timer after submission
      this.stopTimer();

      this.addOutput("✓ Output submitted successfully!", null);
    } catch (error) {
      this.addOutput(
        `Failed to submit: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    }
  }

  solved() {
    this.elements.languageSelector.disabled = true;
    this.elements.startBtn.disable();

    const doc = DB.get<string>(["CODE", this.language]);
    this.setEditor(doc, false);

    this.addOutput(
      "🏆 Problem solved! The editor is in read-only mode.",
      "success"
    );
  }

  wait() {
    const { languageSelector, submitBtn, startBtn, runBtn } = this.elements;
    languageSelector.disabled = true;
    startBtn.disable();
    this.addOutput("Please wait before re-submitting again.");

    const doc = DB.get<string>(["CODE", this.language]);
    this.setEditor(doc, false);

    const checkEnabledTimer = window.setInterval(async () => {
      // Keep checking until the state changes
      this.problem.tick();

      if (this.problem.isReady) {
        languageSelector.disabled = false;
        startBtn.enable();
        runBtn.enable();
        submitBtn.enable();

        clearInterval(checkEnabledTimer);

        this.clear();
        this.setEditor(null, true);
      }
    }, 1000);
  }
}
