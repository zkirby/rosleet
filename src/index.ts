import type {
  EditorElements,
  Language,
  OutputType,
  PyodideInterface,
  StatusState,
  WindowWithExtensions,
} from "./types";
import CSS_STYLES from "./styles.css";
import { Body } from "./body";
import DESC_SVG from "./desc-icon.svg";
import SOLUTIONS_SVG from "./lab-icon.svg";
import { DB } from "./db";
import { Editor } from "./editor";

// GLOBALS
let pyodide: PyodideInterface | null = null;
let editorView: any = null;
let currentLanguage: Language = "python";
let editorContainer: HTMLElement | null = null;
let onRunCodeCallback: (() => void) | null = null;

/**
 * Excluded page sub-paths that shouldn't show the REPL view.
 */
const EXCLUDED_PAGE_PREFIXES = [
  "list-view",
  "topics",
  "tree-view",
  "locations",
];

// ============================================================================
// Utility Functions
// ============================================================================

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS_STYLES;
  document.head.appendChild(style);
}

function updateStatus(
  statusElement: HTMLElement,
  state: StatusState,
  text: string
): void {
  statusElement.className = state;
  const statusText = statusElement.querySelector("#rosalind-repl-status-text");
  if (statusText) {
    statusText.textContent = text;
  }
}

function addOutput(
  outputElement: HTMLElement,
  text: string,
  type: OutputType = ""
): void {
  const line = document.createElement("div");
  line.className = "rosalind-output-line";

  if (type === "error") {
    line.classList.add("rosalind-output-error");
  } else if (type === "success") {
    line.classList.add("rosalind-output-success");
  }

  line.textContent = text;
  outputElement.appendChild(line);
  outputElement.scrollTop = outputElement.scrollHeight;
}

function getLastOutput(outputElement: HTMLElement): string {
  const lines = Array.from(
    outputElement.querySelectorAll(".rosalind-output-line")
  );

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

function submitOutputToForm(output: string): void {
  const form = document.getElementById("id_form_submission") as HTMLFormElement;
  const fileInput = document.getElementById(
    "id_output_file"
  ) as HTMLInputElement;

  if (!form || !fileInput) {
    throw new Error("Submission form or file input not found");
  }

  // Create a File object from the output string
  const blob = new Blob([output], { type: "text/plain" });
  const file = new File([blob], "output.txt", { type: "text/plain" });

  // Create a DataTransfer to set the file
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;

  // Submit the form
  form.submit();
}

// ============================================================================
// External Libraries
// ============================================================================

function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ============================================================================
// CodeMirror Editor
// ============================================================================

function createEditor(
  container: HTMLElement,
  onRunCode: () => void,
  language: Language,
  initialDoc?: string
): any {
  const win = window as WindowWithExtensions;
  if (!win.CodeMirrorSetup) {
    throw new Error("CodeMirror not loaded");
  }

  const {
    EditorView,
    basicSetup,
    python,
    javascript,
    indentUnit,
    keymap,
    indentWithTab,
  } = win.CodeMirrorSetup;

  const languageExtension = language === "python" ? python() : javascript();
  const defaultDocs = {
    python: "# Click 'Start in REPL' to start the challenge...\n",
    javascript: "// Click 'Start in REPL' to start the challenge...\n",
  };

  const runCodeKeymap = keymap.of([
    indentWithTab,
    {
      key: "Ctrl-Enter",
      mac: "Cmd-Enter",
      run: () => {
        onRunCode();
        return true;
      },
    },
  ]);

  // Load saved code if available, otherwise use provided initialDoc or default
  const savedCode = DB.get(DB.KEYS.CODE, "");
  const docToUse = initialDoc || savedCode || defaultDocs[language];

  // Create update listener to save code on changes
  const saveOnUpdate = EditorView.updateListener.of((update: any) => {
    if (update.docChanged) {
      const code = update.state.doc.toString();
      DB.save(DB.KEYS.CODE, code);
    }
  });

  return new EditorView({
    doc: docToUse,
    extensions: [
      basicSetup,
      languageExtension,
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
    parent: container,
  });
}

function initializeCodeMirror(
  container: HTMLElement,
  onRunCode: () => void
): void {
  editorContainer = container;
  onRunCodeCallback = onRunCode;
  editorView = createEditor(container, onRunCode, currentLanguage);
}

function switchLanguage(language: Language): void {
  if (!editorView || !editorContainer || !onRunCodeCallback) return;

  // Save current content
  const currentContent = editorView.state.doc.toString();

  // Destroy old editor
  editorView.destroy();

  // Update language
  currentLanguage = language;

  // Save language preference
  DB.save(DB.KEYS.LANGUAGE_PREFERENCE, language);

  // Transfer dataset to new language environment if it exists
  if (language === "python") {
    const jsDataset = (window as any).dataset;
    if (jsDataset && pyodide) {
      pyodide.globals.set("dataset", jsDataset);
    }
  } else {
    // JavaScript - dataset should already be in window scope
    // No action needed
  }

  const shouldPreserveContent =
    !currentContent.includes("Click 'Start in REPL'") &&
    currentContent.trim() !== "";
  const newDoc = shouldPreserveContent ? currentContent : undefined;

  editorView = createEditor(
    editorContainer,
    onRunCodeCallback,
    language,
    newDoc
  );
}

function getEditorContent(): string {
  if (!editorView) {
    throw new Error("Editor not initialized");
  }
  return editorView.state.doc.toString();
}

function setEditorContent(content: string): void {
  if (!editorView) {
    throw new Error("Editor not initialized");
  }

  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content,
    },
  });
}

// ============================================================================
// Pyodide/Python REPL
// ============================================================================

async function initializePyodide(elements: EditorElements): Promise<void> {
  try {
    updateStatus(elements.status, "loading", "Loading script...");
    // await loadPyodideScript();

    updateStatus(elements.status, "loading", "Initializing...");
    const win = window as WindowWithExtensions;

    if (!win.loadPyodide) {
      throw new Error("Pyodide loader not found");
    }

    pyodide = await win.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
    });

    if (!pyodide) {
      throw new Error("Failed to initialize Pyodide");
    }

    pyodide.runPython(`
import sys
import io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
    `);

    updateStatus(elements.status, "ready", "Ready");
    elements.runBtn.disabled = false;
    addOutput(elements.output, "✓ Python REPL ready.", "success");
  } catch (error) {
    updateStatus(elements.status, "error", "Error");
    addOutput(
      elements.output,
      `Failed to load Python: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      "error"
    );
  }
}

async function runPythonCode(
  code: string,
  elements: EditorElements
): Promise<void> {
  if (!pyodide) {
    addOutput(
      elements.output,
      "Python not loaded yet. Please wait...",
      "error"
    );
    return;
  }

  try {
    elements.runBtn.disabled = true;
    elements.runBtn.textContent = "Running...";

    pyodide.runPython(`
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
    `);

    const result = await pyodide.runPythonAsync(code);
    const stdout = pyodide.runPython("sys.stdout.getvalue()");
    const stderr = pyodide.runPython("sys.stderr.getvalue()");

    addOutput(elements.output, ">>> Running code...", "success");

    if (stdout) {
      addOutput(elements.output, stdout);
    }

    if (stderr) {
      addOutput(elements.output, stderr, "error");
    }

    if (result !== undefined && result !== null) {
      addOutput(elements.output, `Result: ${result}`);
    }

    addOutput(elements.output, ">>> Done.", "success");
  } catch (error) {
    addOutput(
      elements.output,
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error"
    );
  } finally {
    elements.runBtn.disabled = false;
    elements.runBtn.textContent = "Run Code";
  }
}

async function runJavaScriptCode(
  code: string,
  elements: EditorElements
): Promise<void> {
  try {
    elements.runBtn.disabled = true;
    elements.runBtn.textContent = "Running...";

    // Capture console output
    const logs: string[] = [];
    const errors: string[] = [];

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: any[]) => {
      logs.push(
        args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          )
          .join(" ")
      );
    };

    console.error = (...args: any[]) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    };

    console.warn = (...args: any[]) => {
      logs.push("[Warning] " + args.map((arg) => String(arg)).join(" "));
    };

    addOutput(elements.output, ">>> Running code...", "success");

    try {
      // Use AsyncFunction to support await
      const AsyncFunction = Object.getPrototypeOf(
        async function () {}
      ).constructor;
      // Make dataset available in function scope
      const dataset = (window as any).dataset;
      const fn = new AsyncFunction("dataset", code);
      const result = await fn(dataset);

      // Display console output
      if (logs.length > 0) {
        addOutput(elements.output, logs.join("\n"));
      }

      if (errors.length > 0) {
        addOutput(elements.output, errors.join("\n"), "error");
      }

      // Display return value if not undefined
      if (result !== undefined) {
        addOutput(
          elements.output,
          `Result: ${
            typeof result === "object"
              ? JSON.stringify(result, null, 2)
              : result
          }`
        );
      }

      addOutput(elements.output, ">>> Done.", "success");
    } catch (error) {
      addOutput(
        elements.output,
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
    } finally {
      // Restore console
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  } finally {
    elements.runBtn.disabled = false;
    elements.runBtn.textContent = "Run Code";
  }
}

// ============================================================================
// Layout & UI
// ============================================================================

function createSplitLayout(): EditorElements {
  const bodyContent = Body.content;

  const splitContainer = Body.DIV({ id: "rosalind-split-container" });
  const problemSide = Body.DIV({ id: "rosalind-problem-side" });
  const problemHeader = Body.DIV({ id: "rosalind-problem-header" });

  buildSplitPaneHeader(problemHeader);

  const mainContent = Body.DIV({
    id: "rosalind-main-content",
    content: bodyContent,
  });

  const problemFooter = Body.DIV({ id: "rosalind-problem-footer" });
  const rosalindFooter = Body.byQuery(".footer", true);
  problemFooter.appendChild(rosalindFooter);

  problemSide.appendChild(problemHeader);
  problemSide.appendChild(mainContent);
  problemSide.appendChild(problemFooter);

  const replPanel = Body.DIV({
    id: "rosalind-repl-panel",
    content: `
    <div id="rosalind-repl-header">
      <div id="rosalind-repl-header-left">
        <h3>REPL</h3>
        <select id="rosalind-language-selector">
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
        </select>
      </div>
      <span id="rosalind-repl-status" class="loading">
        <span id="rosalind-repl-status-dot"></span>
        <span id="rosalind-repl-status-text">Loading...</span>
      </span>
    </div>
    <div id="rosalind-repl-editor">
      <div id="rosalind-code-input"></div>
    </div>
    <div id="rosalind-repl-controls">
      <button id="rosalind-run-btn" disabled>Run Code</button>
      <button id="rosalind-clear-btn">Clear Output</button>
      <button id="rosalind-submit-btn">Submit Output</button>
    </div>
    <div id="rosalind-repl-output"></div>
  `,
  });

  splitContainer.appendChild(problemSide);
  splitContainer.appendChild(replPanel);

  Body.DANGEROUSLY_set_content(splitContainer);

  const resizer = Body.DIV({ id: "rosalind-resizer" });
  document.body.appendChild(resizer);

  const updateResizerPosition = () => {
    const panelWidth = replPanel.offsetWidth;
    const paddingWidth = 10 + 5;
    resizer.style.left = `${window.innerWidth - panelWidth - paddingWidth}px`;
  };

  updateResizerPosition();

  return {
    runBtn: Body.byId<HTMLButtonElement>("rosalind-run-btn"),
    clearBtn: Body.byId<HTMLButtonElement>("rosalind-clear-btn"),
    submitBtn: Body.byId<HTMLButtonElement>("rosalind-submit-btn"),
    languageSelector: Body.byId<HTMLSelectElement>(
      "rosalind-language-selector"
    ),
    codeInput: Body.byId<HTMLElement>("rosalind-code-input"),
    output: Body.byId<HTMLElement>("rosalind-repl-output"),
    status: Body.byId<HTMLElement>("rosalind-repl-status"),
    resizer,
    replPanel,
    updateResizerPosition,
  };
}

function setupResizer(
  resizer: HTMLElement,
  replPanel: HTMLElement,
  updateResizerPosition: () => void
): void {
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  const startResize = (e: MouseEvent) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = replPanel.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  const doResize = (e: MouseEvent) => {
    if (!isResizing) return;

    const diff = startX - e.clientX;
    const newWidth = startWidth + diff;
    const minWidth = 300;
    const maxWidth = window.innerWidth * 0.8;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
      replPanel.style.width = `${newWidth}px`;
      updateResizerPosition();
    }

    e.preventDefault();
  };

  const stopResize = () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  };

  resizer.addEventListener("mousedown", startResize);
  document.addEventListener("mousemove", doResize);
  document.addEventListener("mouseup", stopResize);
  document.addEventListener("mouseleave", stopResize);
  window.addEventListener("resize", updateResizerPosition);
}

function buildSplitPaneHeader(el: HTMLDivElement) {
  const iconStyle = {
    width: "75px",
    display: "flex",
    height: "fit-content",
    gap: "3px",
  };
  const desc = Body.DIV({
    content: `${DESC_SVG} <div>Description</div>`,
    style: { fontWeight: "500", ...iconStyle },
  });
  const solutions = Body.A({
    href: "/problems/subs/recent/",
    content: `${SOLUTIONS_SVG} <div>Solutions</div>`,
    style: { ...iconStyle },
  });

  const next = Body.byQuery("li.next > a");
  const prev = Body.byQuery("li.previous > a");

  const left = Body.DIV({
    classList: ["problem-header-div"],
  });
  const right = Body.DIV({
    classList: ["problem-header-div"],
  });

  left.appendChild(desc);
  left.appendChild(solutions);

  right.appendChild(prev);
  right.appendChild(next);

  el.appendChild(left);
  el.appendChild(right);
}

// ============================================================================
// Dataset Loading
// ============================================================================

function setupStartButton(elements: EditorElements): void {
  setTimeout(() => {
    const downloadLink = Body.byQuery<HTMLAnchorElement>(
      "a#id_problem_dataset_link"
    );
    if (!downloadLink) return;

    // Hide download link once found
    downloadLink.style.display = "none";

    const datasetUrl = downloadLink.href;
    const buttonContainer = Body.DIV({
      css: `
        display: inline-flex !important;
        gap: 12px !important;
        align-items: center !important;
      `,
    });

    const startButton = document.createElement("button");
    startButton.textContent = "Start in REPL";
    startButton.className = "rosalind-start-btn";
    startButton.style.cssText = `
      background-color: #10b981 !important;
      color: white !important;
      border: none !important;
      border-radius: 6px !important;
      padding: 10px 20px !important;
      font-weight: 600 !important;
      font-size: 14px !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
      box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2) !important;
    `;

    startButton.addEventListener("mouseenter", () => {
      startButton.style.backgroundColor = "#059669";
      startButton.style.transform = "translateY(-1px)";
      startButton.style.boxShadow = "0 4px 8px rgba(16, 185, 129, 0.3)";
    });

    startButton.addEventListener("mouseleave", () => {
      startButton.style.backgroundColor = "#10b981";
      startButton.style.transform = "translateY(0)";
      startButton.style.boxShadow = "0 2px 4px rgba(16, 185, 129, 0.2)";
    });

    startButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        startButton.disabled = true;
        startButton.textContent = "Loading...";
        startButton.style.backgroundColor = "#6b7280";

        const response = await fetch(datasetUrl);
        const datasetText = await response.text();

        // Inject dataset into execution environment
        if (currentLanguage === "python") {
          // Inject into Python globals
          if (pyodide) {
            pyodide.globals.set("dataset", datasetText);
          }
        } else {
          // Inject into JavaScript global scope
          (window as any).dataset = datasetText;
        }

        const code = Editor.getSkeleton(datasetText);

        setEditorContent(code);
        addOutput(
          elements.output,
          "✓ Dataset loaded! Ready to analyze.",
          "success"
        );

        startButton.textContent = "Reload Dataset";
        startButton.style.backgroundColor = "#10b981";
        startButton.disabled = false;
      } catch (error) {
        addOutput(
          elements.output,
          `Error loading dataset: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
        startButton.textContent = "Start in REPL";
        startButton.style.backgroundColor = "#10b981";
        startButton.disabled = false;
      }
    });

    const parent = downloadLink.parentNode;
    if (parent) {
      parent.insertBefore(buttonContainer, downloadLink);
      buttonContainer.appendChild(downloadLink);
      buttonContainer.appendChild(startButton);
    }
  }, 1000);
}

// ============================================================================
// __main__
// ============================================================================

(async function main() {
  "use strict";

  const isExcludedPage = EXCLUDED_PAGE_PREFIXES.some((prefix) =>
    window.location.pathname.includes(`problems/${prefix}`)
  );
  if (isExcludedPage) {
    console.log("Rosalind LeetCode Style loaded (excluded page - no REPL)");
    return;
  }

  injectStyles();

  // Step 1: Create the split layout right away
  const elements = createSplitLayout();
  setupResizer(
    elements.resizer,
    elements.replPanel,
    elements.updateResizerPosition
  );

  try {
    // Load language preference before initializing editor
    currentLanguage = DB.get(DB.KEYS.LANGUAGE_PREFERENCE, "python");
    elements.languageSelector.value = currentLanguage;

    await Editor.init();

    const runCode = () => {
      const code = getEditorContent();
      if (currentLanguage === "python") {
        runPythonCode(code, elements);
      } else {
        runJavaScriptCode(code, elements);
      }
    };

    initializeCodeMirror(elements.codeInput, runCode);

    // Language selector handler
    elements.languageSelector.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      const language = target.value as Language;
      switchLanguage(language);
    });

    elements.runBtn.addEventListener("click", runCode);
    elements.clearBtn.addEventListener("click", () => {
      elements.output.innerHTML = "";
    });

    elements.submitBtn.addEventListener("click", () => {
      try {
        const output = getLastOutput(elements.output);
        if (!output) {
          addOutput(
            elements.output,
            "No output to submit. Run your code first.",
            "error"
          );
          return;
        }
        submitOutputToForm(output);
        addOutput(
          elements.output,
          "✓ Output submitted successfully!",
          "success"
        );
      } catch (error) {
        addOutput(
          elements.output,
          `Failed to submit: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
      }
    });

    await initializePyodide(elements);
    setupStartButton(elements);
  } catch (error) {
    console.error("Failed to initialize editor:", error);
    addOutput(
      elements.output,
      `Failed to initialize editor: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      "error"
    );
  }

  console.log("Rosalind LeetCode Style with Python REPL loaded!");
})();
