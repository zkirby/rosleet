import CSS_STYLES from "./styles.css";
import { $ } from "./$";
import { Editor } from "./editor";
import mj from "./mathjax";
import {
  addStartButton,
  createLoadingOverlay,
  createSplitLayout,
  setupResizer,
} from "./layouts";
import { Problem } from "./problem";

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
  const hideOverlay = createLoadingOverlay({
    title: "Loading…",
  });

  const { editorElements, replPanel, resizer, updateResizerPosition } =
    createSplitLayout();
  setupResizer(resizer, replPanel, updateResizerPosition);

  const problem = new Problem();
  const startBtn = addStartButton(problem);
  const datasetUrl = await getDatasetDownloadLink();

  const editor = new Editor(
    { ...editorElements, startBtn },
    problem,
    datasetUrl
  );

  try {
    await editor.init();

    mj.switchToSvg();

    // Initialize editor to correct problem state.
    if (problem.isSolved) {
      editor.solved();
    } else if (problem.isWaiting) {
      editor.wait();
    } else if (problem.isStarted) {
      // Auto-start if already started
      editor.start();
    }

    console.log("Rosalind LeetCode Style with Python REPL loaded!");
  } catch (error) {
    console.error("Failed to initialize editor:", error);
    editor.addOutput(
      `Failed to initialize editor: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      "error"
    );
  } finally {
    hideOverlay();
  }
})();

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS_STYLES;
  document.head.appendChild(style);
}

/** Returns the link to download the dataset to start the game */
async function getDatasetDownloadLink(): Promise<string> {
  const MAX_ATTEMPTS = 80; // ~8s @ 100ms
  let attempts = 0;

  return new Promise((res, rej) => {
    const downloadDataset = () => {
      attempts += 1;

      const downloadLink = $().byQuery<HTMLAnchorElement>(
        "a#id_problem_dataset_link"
      );
      const propertiesEl = $().byQuery(".problem-properties");

      if (!downloadLink || !propertiesEl) {
        if (attempts >= MAX_ATTEMPTS) {
          rej("No dataset found, problem cannot be started");
          return;
        }
        window.setTimeout(downloadDataset, 100);
        return;
      }

      downloadLink.style.display = "none";
      res(downloadLink.href);
    };

    window.setTimeout(downloadDataset, 0);
  });
}
