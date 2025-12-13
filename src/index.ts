import type { EditorElements } from "./types";
import CSS_STYLES from "./styles.css";
import { $, $$, QueryWrapper } from "./$";
import DESC_SVG from "./desc-icon.svg";
import SOLUTIONS_SVG from "./lab-icon.svg";
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

  // Create the split pane layout
  const elements = createSplitLayout();
  setupResizer(
    elements.resizer,
    elements.replPanel,
    elements.updateResizerPosition
  );

  const editor = new Editor(elements);

  try {
    // Setup editor
    await editor.init();

    setupStartButton(editor);

    // Reset MathJax formatting
    if ((window as any).MathJax) {
      console.log("MathJax found");
      setTimeout(() => {
        (window as any).MathJax.Hub.Rerender();
      }, 1000);
    } else {
      console.log("MathJax not found");
    }
  } catch (error) {
    console.error("Failed to initialize editor:", error);
    editor.addOutput(
      `Failed to initialize editor: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      "error"
    );
  }

  console.log("Rosalind LeetCode Style with Python REPL loaded!");
})();

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS_STYLES;
  document.head.appendChild(style);
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

function setupStartButton(editor: Editor): void {
  setTimeout(() => {
    const downloadLink = $().byQuery<HTMLAnchorElement>(
      "a#id_problem_dataset_link"
    );
    if (!downloadLink) return;

    // Hide download link once found
    downloadLink.style.display = "none";

    const datasetUrl = downloadLink.href;

    const secondTitleLine = $($().byQuery(".problem-properties"));
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

    startButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        startButton.disabled = true;
        startButton.textContent = "Loading...";
        startButton.style.backgroundColor = "#6b7280";

        const response = await fetch(datasetUrl);
        const datasetText = await response.text();

        editor.start(datasetText);

        startButton.textContent = "Reload Dataset";
        startButton.style.backgroundColor = "#10b981";
        startButton.disabled = false;
      } catch (error) {
        editor.addOutput(
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
  }, 1000);
}
