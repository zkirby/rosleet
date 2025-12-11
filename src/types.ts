export interface PyodideInterface {
  runPython: (code: string) => string;
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: {
    set: (key: string, value: any) => void;
    get: (key: string) => any;
  };
}

export interface CodeMirrorSetup {
  EditorView: any;
  basicSetup: any;
  python: () => any;
  javascript: () => any;
  indentUnit: any;
  keymap: any;
  indentWithTab: any;
}

export type Language = "python" | "javascript";

export interface EditorElements {
  runBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  submitBtn: HTMLButtonElement;
  languageSelector: HTMLSelectElement;
  codeInput: HTMLElement;
  output: HTMLElement;
  status: HTMLElement;
  resizer: HTMLElement;
  replPanel: HTMLElement;
  updateResizerPosition: () => void;
}

export type StatusState = "loading" | "ready" | "error";
export type OutputType = "error" | "success" | "";

export interface WindowWithExtensions extends Window {
  CodeMirrorSetup?: CodeMirrorSetup;
  loadPyodide?: (config: { indexURL: string }) => Promise<PyodideInterface>;
}

export interface CSSProperties {
  [key: string]: string | number | CSSProperties;
}
