import { CSSProperties } from "./types";

/**
 * Simple wrapper around the `document` and `document.body` for improved ergonomics
 */
export class Body {
  constructor() {
    if (document == null || document.body == null) {
      throw new Error("Document or body not found");
    }
  }

  static get content() {
    return document.body.innerHTML;
  }

  static DANGEROUSLY_set_content(content: Node) {
    document.body.innerHTML = "";
    document.body.appendChild(content);
  }

  private static ELEMENT<T extends HTMLElement>(
    tag: string,
    {
      id,
      content,
      style,
      classList,
      css,
    }: {
      id?: string;
      content?: string;
      style?: CSSProperties;
      classList?: string[];
      css?: string;
    } = {}
  ) {
    const d = document.createElement(tag) as T;
    if (id) d.id = id;
    if (content) d.innerHTML = content;
    if (style) {
      for (const [key, value] of Object.entries(style)) {
        d.style[key as any] = value as string;
      }
    }
    if (classList) {
      for (const className of classList) {
        d.classList.add(className);
      }
    }
    if (css) d.style.cssText = css;
    return d;
  }

  static DIV(args: Parameters<typeof Body.ELEMENT>[1]) {
    return Body.ELEMENT<HTMLDivElement>("div", args);
  }
  static A({
    href,
    ...args
  }: { href: string } & Parameters<typeof Body.ELEMENT>[1]) {
    const a = Body.ELEMENT<HTMLAnchorElement>("a", args);
    if (href) a.href = href;
    return a;
  }

  static byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    return el as T;
  }
  static byQuery<T extends HTMLElement = HTMLElement>(
    query: string,
    remove: boolean = false
  ): T {
    const el = document.querySelector(query);
    if (remove) el?.remove();
    return el as T;
  }

  static queryAll<T extends HTMLElement = HTMLElement>(query: string): T[] {
    const els = document.querySelectorAll(query);
    return Array.from(els) as T[];
  }
}
