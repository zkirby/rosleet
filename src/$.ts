import { CSSProperties } from "./types";

/**
 * Simple wrapper around DOM APIs for improved ergonomics
 * over the most commonly used APIs.
 */
export class QueryWrapper<TEl extends HTMLElement = HTMLElement> {
  constructor(public readonly el: TEl = document.body as TEl) {
    if (document == null || document.body == null) {
      throw new Error("Document or body not found");
    }
  }

  get content() {
    return this.el.innerHTML;
  }

  append(node: Node | QueryWrapper | null) {
    if (node == null) {
      console.warn("received null child, cannot append");
      return;
    }
    return this.el.appendChild(QueryWrapper.unwrap(node));
  }

  DANGEROUSLY_set_content(content: Node | QueryWrapper) {
    this.el.innerHTML = "";
    this.el.appendChild(QueryWrapper.unwrap(content));
  }

  byQuery<T extends HTMLElement = HTMLElement>(
    query: string,
    remove: boolean = false
  ): T {
    const el = this.el.querySelector(query);
    if (remove) el?.parentNode?.removeChild(el);
    return el as T;
  }
  queryAll<T extends HTMLElement = HTMLElement>(query: string): T[] {
    const els = this.el.querySelectorAll(query);
    return Array.from(els) as T[];
  }
  static byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    return el as T;
  }
  hide(query: string): void {
    this.byQuery(query).remove();
  }

  private static unwrap(node: Node | QueryWrapper) {
    return node instanceof QueryWrapper ? node.el : node;
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
    return new QueryWrapper(d);
  }

  static DIV(args: Parameters<typeof QueryWrapper.ELEMENT>[1]) {
    return QueryWrapper.ELEMENT<HTMLDivElement>("div", args);
  }
  static A({
    href,
    ...args
  }: { href: string } & Parameters<typeof QueryWrapper.ELEMENT>[1]) {
    const a = QueryWrapper.ELEMENT<HTMLAnchorElement>("a", args);
    if (href) a.el.href = href;
    return a;
  }
  static BUTTON(args: Parameters<typeof QueryWrapper.ELEMENT>[1]) {
    return QueryWrapper.ELEMENT<HTMLButtonElement>("button", args);
  }
}

export const $ = (el?: HTMLElement) => new QueryWrapper(el);
export const $$ = QueryWrapper;
