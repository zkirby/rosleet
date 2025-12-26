import type { EditorElements } from "./types";
import CSS_STYLES from "./styles.css";
import { $, $$, QueryWrapper } from "./$";
import DESC_SVG from "./icons/desc-icon.svg";
import SOLUTIONS_SVG from "./icons/lab-icon.svg";
import QUESTION_SVG from "./icons/question-icon.svg";
import EXPLAIN_SVG from "./icons/explain-icon.svg";
import { DB } from "./db";
import { Editor } from "./editor";

/**
 * Excluded page sub-paths that shouldn't show the REPL view.
 */
const EXCLUDED_PAGE_PREFIXES = [
  "list-view",
  "topics",
  "tree-view",
  "locations",
];
const EXCLUDED_PAGE_SUFFIXES = ["subs/recent/", "questions/", "explanation/"];

(async function main() {
  "use strict";

  const isExcludedPrefix = EXCLUDED_PAGE_PREFIXES.some((prefix) =>
    window.location.pathname.includes(`problems/${prefix}`)
  );
  const isExcludedSuffix = EXCLUDED_PAGE_SUFFIXES.some((suffix) =>
    window.location.pathname.endsWith(suffix)
  );
  if (isExcludedPrefix || isExcludedSuffix) {
    console.log("Rosalind LeetCode Style loaded (excluded page - no REPL)");
    return;
  }

  injectStyles();
  const loadingOverlay = createLoadingOverlay({
    title: "Loading…",
  });

  // Create the split pane layout
  const elements = createSplitLayout();
  setupResizer(
    elements.resizer,
    elements.replPanel,
    elements.updateResizerPosition
  );

  const editor = new Editor(elements);

  try {
    await editor.init();

    setupStartButton(editor, { onMounted: () => loadingOverlay.hide() });
  } catch (error) {
    console.error("Failed to initialize editor:", error);
    editor.addOutput(
      `Failed to initialize editor: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      "error"
    );
  } finally {
    loadingOverlay.hide();
  }

  console.log("Rosalind LeetCode Style with Python REPL loaded!");
})();

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS_STYLES;
  document.head.appendChild(style);
}

function createLoadingOverlay(opts: { title?: string }): {
  hide: () => void;
} {
  const overlay = $$.DIV({
    id: "rosalind-loading-overlay",
    css: `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
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
      background: rgba(30, 41, 59, 0.75);
      border: 1px solid rgba(148, 163, 184, 0.25);
      box-shadow: 0 18px 60px rgba(0,0,0,0.45);
    `,
  });

  const spinner = $$.DIV({
    css: `
      width: 34px;
      height: 34px;
      border-radius: 999px;
      border: 3px solid rgba(148, 163, 184, 0.35);
      border-top-color: rgba(255, 255, 255, 0.9);
      animation: rosalindSpin 0.9s linear infinite;
    `,
  });

  const title = $$.DIV({
    content: opts.title ?? "Loading…",
    css: `
      font-size: 14px;
      font-weight: 650;
      letter-spacing: 0.2px;
    `,
  });

  card.append(spinner);
  card.append(title);
  overlay.append(card);

  const style = document.createElement("style");
  style.textContent = `
@keyframes rosalindSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
#rosalind-loading-overlay.rosalind-fadeout { opacity: 0; transition: opacity 180ms ease; }
  `.trim();
  document.head.appendChild(style);
  document.body.appendChild(overlay.el);

  const hide = () => {
    const el = $$.byId("rosalind-loading-overlay");
    if (!el) return;
    el.classList.add("rosalind-fadeout");
    window.setTimeout(() => el.remove(), 200);
  };

  return { hide };
}

// ============================================================================
// Layouts
// ============================================================================
function createSplitLayout(): EditorElements {
  const rosalindFooter = $().byQuery(".footer", true);

  const splitContainer = $$.DIV({ id: "rosalind-split-container" });
  const problemSide = $$.DIV({ id: "rosalind-problem-side" });
  const problemHeader = $$.DIV({ id: "rosalind-problem-header" });

  buildSplitPaneHeader(problemHeader);

  const mainContent = $$.DIV({
    id: "rosalind-main-content",
    content: $().content,
  });

  const problemFooter = $$.DIV({ id: "rosalind-problem-footer" });
  problemFooter.append(rosalindFooter);

  problemSide.append(problemHeader);
  problemSide.append(mainContent);
  problemSide.append(problemFooter);

  // Switch MathJax to SVG rendering to avoid layout issues
  if (typeof (window as any).MathJax !== "undefined") {
    const MathJax = (window as any).MathJax;
    if (MathJax.Hub) {
      MathJax.Hub.Config({
        SVG: { linebreaks: { automatic: true } },
        "SVG-Math": { linebreaks: { automatic: true } },
      });

      MathJax.Hub.Queue(
        ["setRenderer", MathJax.Hub, "SVG"],
        ["Rerender", MathJax.Hub]
      );
    }
  }

  const replPanel = $$.DIV({
    id: "rosalind-repl-panel",
    content: `
    <div id="rosalind-repl-header">
      <div id="rosalind-repl-header-left">
        <h3>REPL</h3>
        <select id="rosalind-language-selector">
          <option value="python">Python ▼</option>
          <option value="javascript">JavaScript ▼</option>
        </select>
      </div>
      <div id="rosalind-repl-header-right">
        <span id="rosalind-timer" style="display: none;">
          <svg id="rosalind-timer-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span id="rosalind-timer-text">5:00</span>
        </span>
        <span id="rosalind-repl-status" class="loading">
          <span id="rosalind-repl-status-dot"></span>
          <span id="rosalind-repl-status-text">Loading...</span>
        </span>
      </div>
    </div>
    <div id="rosalind-repl-editor">
      <div id="rosalind-code-input"></div>
    </div>
    <div id="rosalind-repl-controls">
      <button id="rosalind-run-btn" disabled>Run Code</button>
      <button id="rosalind-clear-btn">Clear Output</button>
      <button id="rosalind-submit-btn" disabled>Submit Output</button>
    </div>
    <div id="rosalind-repl-output"></div>
  `,
  }).el;

  splitContainer.append(problemSide);
  splitContainer.append(replPanel);

  $().DANGEROUSLY_set_content(splitContainer);

  const resizer = $$.DIV({ id: "rosalind-resizer" }).el;
  $().append(resizer);

  const updateResizerPosition = () => {
    const panelWidth = replPanel.offsetWidth;
    const paddingWidth = 10 + 5;
    resizer.style.left = `${window.innerWidth - panelWidth - paddingWidth}px`;
  };

  updateResizerPosition();

  return {
    runBtn: $$.byId<HTMLButtonElement>("rosalind-run-btn"),
    clearBtn: $$.byId<HTMLButtonElement>("rosalind-clear-btn"),
    submitBtn: $$.byId<HTMLButtonElement>("rosalind-submit-btn"),
    languageSelector: $$.byId<HTMLSelectElement>("rosalind-language-selector"),
    codeInput: $$.byId<HTMLElement>("rosalind-code-input"),
    output: $$.byId<HTMLElement>("rosalind-repl-output"),
    status: $$.byId<HTMLElement>("rosalind-repl-status"),
    timer: $$.byId<HTMLElement>("rosalind-timer"),
    timerText: $$.byId<HTMLElement>("rosalind-timer-text"),
    resizer,
    replPanel,
    updateResizerPosition,
  };
}

function buildSplitPaneHeader(el: QueryWrapper) {
  const desc = $$.DIV({
    content: `${DESC_SVG} <div>Description</div>`,
    style: {
      fontWeight: "500",
      width: "90px",
      display: "flex",
      height: "fit-content",
      gap: "3px",
    },
  });
  const solutions = $$.A({
    href: "/problems/subs/recent/",
    content: `${SOLUTIONS_SVG} <div>Solutions</div>`,
    style: {
      width: "75px",
      display: "flex",
      height: "fit-content",
      gap: "3px",
    },
  });
  const explain = $$.A({
    href: `${DB.problemId}explanation/`,
    content: `${EXPLAIN_SVG} <div>Explanation</div>`,
    style: {
      width: "90px",
      display: "flex",
      height: "fit-content",
      gap: "3px",
    },
  });
  const questions = $$.A({
    href: `${DB.problemId}questions/`,
    content: `${QUESTION_SVG} <div>Questions</div>`,
    style: {
      width: "82px",
      display: "flex",
      height: "fit-content",
      gap: "3px",
    },
  });

  const next = $().byQuery("li.next > a");
  const prev = $().byQuery("li.previous > a");

  const left = $$.DIV({
    classList: ["problem-header-div"],
  });
  const right = $$.DIV({
    classList: ["problem-header-div"],
  });

  left.append(desc);
  left.append(solutions);

  const extra = $().byQuery(".problem-comments");
  if (extra.childElementCount > 0) {
    left.append(explain);
    left.append(questions);
    extra.remove();
  }

  right.append(prev);
  right.append(next);

  el.append(left);
  el.append(right);
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
    $().el.style.cursor = "col-resize";
    $().el.style.userSelect = "none";
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
      $().el.style.cursor = "";
      $().el.style.userSelect = "";
    }
  };

  resizer.addEventListener("mousedown", startResize);
  document.addEventListener("mousemove", doResize);
  document.addEventListener("mouseup", stopResize);
  document.addEventListener("mouseleave", stopResize);
  window.addEventListener("resize", updateResizerPosition);
}

function setupStartButton(
  editor: Editor,
  opts?: { onMounted?: () => void }
): void {
  const MAX_ATTEMPTS = 80; // ~8s @ 100ms
  let attempts = 0;

  const tick = () => {
    attempts += 1;

    const downloadLink = $().byQuery<HTMLAnchorElement>(
      "a#id_problem_dataset_link"
    );
    const propertiesEl = $().byQuery(".problem-properties");

    if (!downloadLink || !propertiesEl) {
      if (attempts >= MAX_ATTEMPTS) {
        // Don't block the page forever if the link never appears.
        opts?.onMounted?.();
        return;
      }
      window.setTimeout(tick, 100);
      return;
    }

    downloadLink.style.display = "none";
    const datasetUrl = downloadLink.href;

    DB.save(["DATASET_URL"], datasetUrl);

    $().hide(".problem-timelimit");

    const secondTitleLine = $(propertiesEl);
    const startButton = $$.BUTTON({
      content: "start ▶︎",
      css: `
        background-color: #46a546 !important;
        color: white !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 5px 10px !important;
        font-weight: 600 !important;
        font-size: 14px;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2) !important;
        margin-left: auto !important;
      `,
      classList: ["rosalind-start-btn"],
    }).el;
    secondTitleLine.append(startButton);

    opts?.onMounted?.();

    startButton.addEventListener("mouseenter", () => {
      startButton.style.backgroundColor = "#059669 !important";
      startButton.style.transform = "translateY(-1px)";
      startButton.style.boxShadow = "0 4px 8px rgba(16, 185, 129, 0.3)";
    });

    startButton.addEventListener("mouseleave", () => {
      startButton.style.backgroundColor = "#46a546 !important";
      startButton.style.transform = "translateY(0)";
      startButton.style.boxShadow = "0 2px 4px rgba(16, 185, 129, 0.2)";
    });

    const onStart = async () => {
      try {
        startButton.disabled = true;
        startButton.textContent = "Loading...";
        startButton.style.backgroundColor = "#6b7280";
        startButton.style.opacity = "0.7";

        const response = await fetch(datasetUrl);
        const datasetText = await response.text();

        editor.start(datasetText, startButton);
      } catch (error) {
        editor.addOutput(
          `Error loading dataset: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
        startButton.textContent = "start ▶︎";
        startButton.style.backgroundColor = "#10b981";
        startButton.disabled = false;
      }
    };

    startButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      onStart();
    });

    const startTimestamp = DB.get<number>(["START_TIMESTAMP"]);
    const fiveMinutesInMs = 5 * 60 * 1000;
    const now = Date.now();
    if (startTimestamp) {
      if (now - startTimestamp < fiveMinutesInMs) {
        onStart();
      } else {
        DB.save(["START_TIMESTAMP"], null);
      }
    }
  };

  window.setTimeout(tick, 0);
}
