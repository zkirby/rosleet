import { $, $$ } from "./$";
import { DB } from "./db";
import { JavaScriptRunner } from "./executors/javascript";
import { PythonRunner } from "./executors/python";
import { Runner } from "./executors/runner";
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
  private datasetUrl: string = "";
  private started: boolean = false;
  private _runnerCache: Record<Language, Runner> = {
    python: new PythonRunner(),
    javascript: new JavaScriptRunner(),
  };
  private btn: any = null;
  private timerInterval: number | null = null;
  private remainingSeconds: number = 300;
  private loadingOverlay: HTMLElement | null = null;
  private submitCooldownInterval: number | null = null;
  private isSuccessful: boolean = false;

  constructor(private elements: EditorElements) {}

  async init(): Promise<void> {
    try {
      // Check if problem is already successful
      this.checkForSuccess();

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
      // reset the editor with the new language
      this.reset();

      // Set up cntrl buttons
      const { runBtn, clearBtn, submitBtn } = this.elements;
      const brun = this.run.bind(this);
      const bclear = this.clear.bind(this);
      runBtn.addEventListener("click", brun);
      clearBtn.addEventListener("click", bclear);
      submitBtn.addEventListener("click", this.submit.bind(this));

      // Initialize submit cooldown check (only if not already successful)
      if (!this.canSubmit()) {
        this.startSubmitCooldownCheck();
      }

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

      // If successful, handle success state
      if (this.isSuccessful) {
        // Mark as started so editor shows code instead of placeholder
        this.started = true;
        // Don't load dataset for already solved problems
        // Handle success (non-blocking)
        this.handleSuccess().catch((error) => {
          console.error("Error handling success state:", error);
        });
      }
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
    return DB.get(["LANGUAGE_PREFERENCE"]) ?? "python";
  }

  set language(language: Language) {
    // Update language
    DB.save(["LANGUAGE_PREFERENCE"], language);

    // Reset the editor
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
    if (!this.canSubmit()) {
      this.addOutput("Please wait before running again.", "error");
      return;
    }
    const code = this.content;
    if (code.trim() == "") {
      this.addOutput("Nothing to run...", "error");
      return;
    }

    const { runBtn } = this.elements;
    runBtn.disabled = true;
    runBtn.textContent = "Running...";

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
  async start(dataset: string, datasetUrl: string, btn: HTMLButtonElement) {
    this.dataset = dataset;
    this.started = true;
    this.datasetUrl = datasetUrl;
    this.btn = btn;

    await this.reset();

    this.addOutput("✓ Dataset loaded! Ready to analyze.", null);

    const { runBtn, submitBtn } = this.elements;
    runBtn.disabled = false;
    submitBtn.disabled = false;
    btn.textContent = "start ▶︎";

    // Start the timer
    if (this.canSubmit()) {
      this.startTimer(btn);
    }
  }

  /** Start the 5-minute countdown timer */
  private startTimer(btn: HTMLButtonElement) {
    this.stopTimer();

    const startTimestamp = DB.get<number>(["START_TIMESTAMP"]);
    const fiveMinutesInMs = 5 * 60 * 1000;
    const now = Date.now();

    if (startTimestamp && now - startTimestamp < fiveMinutesInMs) {
      const elapsedMs = now - startTimestamp;
      const remainingMs = fiveMinutesInMs - elapsedMs;
      this.remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    } else {
      this.remainingSeconds = 300;
      if (!startTimestamp || now - startTimestamp >= fiveMinutesInMs) {
        DB.save(["START_TIMESTAMP"], now);
      }
    }

    const { timer } = this.elements;
    timer.style.display = "flex";

    this.updateTimerDisplay();

    this.timerInterval = window.setInterval(() => {
      this.remainingSeconds--;
      this.updateTimerDisplay();

      if (this.remainingSeconds <= 0) {
        this.stopTimer();
        this.addOutput("⏰ Time's up! Try again.", "error");
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.backgroundColor = "#10b981";

        // Clear the timestamp when time expires
        DB.save(["START_TIMESTAMP"], null);
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
    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    timerText.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  /** Show loading overlay in the editor pane */
  private showLoadingOverlay() {
    if (this.loadingOverlay) return;

    const overlay = $$.DIV({
      id: "rosalind-editor-loading-overlay",
      css: `
        position: absolute;
        inset: 0;
        z-index: 1000;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #1a1a1a;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      `,
    });

    const card = $$.DIV({
      css: `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 18px 20px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(0, 0, 0, 0.1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      `,
    });

    const spinner = $$.DIV({
      css: `
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 3px solid rgba(0, 0, 0, 0.1);
        border-top-color: #0e639c;
        animation: rosalindEditorSpin 0.8s linear infinite;
      `,
    });

    const title = $$.DIV({
      content: "Loading language runtime...",
      css: `
        font-size: 13px;
        font-weight: 500;
        color: #1a1a1a;
      `,
    });

    card.append(spinner);
    card.append(title);
    overlay.append(card);

    // Add animation if not already present
    if (!$$.byId("rosalind-editor-spinner-style")) {
      const style = document.createElement("style");
      style.id = "rosalind-editor-spinner-style";
      style.textContent = `
        @keyframes rosalindEditorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const editorContainer = this.elements.codeInput.parentElement;
    if (editorContainer) {
      editorContainer.style.position = "relative";
      editorContainer.appendChild(overlay.el);
      this.loadingOverlay = overlay.el;
    }
  }

  /** Hide loading overlay in the editor pane */
  private hideLoadingOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.remove();
      this.loadingOverlay = null;
    }
  }

  /** reset the editor after a language change */
  private async reset() {
    this.status = "loading";

    const needsInit = !this.runner.initialized;
    if (needsInit) {
      this.showLoadingOverlay();
    }

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

      // If started, prefer (1) saved code for that language, otherwise (2) skeleton for that language.
      // If not started, show the default placeholder.
      const savedCode = DB.get<string>(["CODE", this.language]);

      // Create update listener to save code on changes (only if not successful)
      const saveOnUpdate = EditorView.updateListener.of((update: any) => {
        if (update.docChanged && !this.isSuccessful) {
          const code = update.state.doc.toString();
          DB.save(["CODE", this.language], code);
        }
      });

      // Initialize the new runner if needed
      await this.initRunner();
      this.hideLoadingOverlay();

      // Determine what document to show
      let docToUse: string;
      if (this.isSuccessful) {
        // If successful, only show saved code if it exists, otherwise show default placeholder
        docToUse =
          savedCode && typeof savedCode === "string"
            ? savedCode
            : defaultDocs[this.language];
      } else if (this.started && this.runner.initialized) {
        // If started normally, prefer saved code, otherwise use skeleton
        docToUse =
          savedCode && typeof savedCode === "string"
            ? savedCode
            : this.runner.getSkeleton();
      } else {
        // Not started, show default placeholder
        docToUse = defaultDocs[this.language];
      }

      // Reset the view
      this.view = new EditorView({
        doc: docToUse,
        extensions: [
          extension[this.language](),
          indentUnit.of("    "),
          basicSetup,
          saveOnUpdate,
          // Make editor editable only if started and not successful
          EditorView.editable.of(this.started && !this.isSuccessful),
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
      this.hideLoadingOverlay();
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
    const classList = [
      "rosalind-output-line",
      type === "error"
        ? "rosalind-output-error"
        : type === "success"
        ? "rosalind-output-success"
        : "",
    ].filter((cls) => cls !== ""); // Filter out empty strings
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

  /** Check if submission is allowed by looking for the "Please wait" element */
  public canSubmit(): boolean {
    const pleaseWaitElement = $().byQuery(".problem-timewait");
    if (pleaseWaitElement && pleaseWaitElement.style.display !== "none") {
      return false;
    }
    return true;
  }

  /** Update the submit button state based on presence of "Please wait" element */
  private async updateSubmitButtonState(): Promise<void> {
    const { submitBtn, runBtn } = this.elements;

    // If problem is already successful, button should be disabled (handled in handleSuccess)
    if (this.isSuccessful) {
      return;
    }

    const canSubmit = this.canSubmit();

    if (canSubmit) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Output";

      const response = await fetch(this.datasetUrl);
      this.dataset = await response.text();
      this.start(this.dataset, this.datasetUrl, this.btn);

      this.stopSubmitCooldownCheck();
    } else {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submit (Wait 50s)";
      runBtn.disabled = true;
      this.addOutput("Please wait 50s before submitting again.");
    }
  }

  /** Start periodic check for submit cooldown */
  private startSubmitCooldownCheck(): void {
    this.stopSubmitCooldownCheck();
    this.updateSubmitButtonState();

    this.submitCooldownInterval = window.setInterval(() => {
      this.updateSubmitButtonState();
    }, 1000);
  }

  /** Stop the submit cooldown check interval */
  private stopSubmitCooldownCheck(): void {
    if (this.submitCooldownInterval !== null) {
      clearInterval(this.submitCooldownInterval);
      this.submitCooldownInterval = null;
    }
  }

  submit() {
    // Check cooldown before allowing submission
    if (!this.canSubmit()) {
      this.addOutput("Please wait before submitting again.", "error");
      return;
    }

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

      // Reset start timestamp
      DB.save(["START_TIMESTAMP"], null);

      // Stop the top-level timer after submission
      this.stopTimer();

      // Create a File object from the output string
      const blob = new Blob([output], { type: "text/plain" });
      const file = new File([blob], "output.txt", { type: "text/plain" });

      // Create a DataTransfer to set the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      // Submit the form
      form.submit();
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

  /** Check if the problem has been successfully solved */
  checkForSuccess(): boolean {
    const successElement = document.querySelector("span.label.label-success");
    if (
      successElement &&
      successElement.textContent?.includes("Congratulations")
    ) {
      this.isSuccessful = true;
      return true;
    }
    this.isSuccessful = false;
    return false;
  }

  /** Handle the success state - clear timers, make editor read-only, show saved code */
  async handleSuccess(): Promise<void> {
    // Clear all timers
    this.stopTimer();
    this.stopSubmitCooldownCheck();

    // Disable all buttons
    const { runBtn, submitBtn, clearBtn, languageSelector } = this.elements;
    runBtn.disabled = true;
    submitBtn.disabled = true;
    clearBtn.disabled = true;
    languageSelector.disabled = true;

    // Load and display the submitted code if available
    const savedCode = DB.get<string>(["CODE", this.language]);
    if (this.view) {
      await this.reset();
    }

    // Show solved message in output with trophy emoji
    const message = savedCode
      ? "🏆 Problem solved! The editor is in read-only mode."
      : "🏆 Problem solved!";
    this.addOutput(message, "success");
  }
}
