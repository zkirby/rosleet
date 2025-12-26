const TopLevelKeys = {
  CODE: "CODE",
  LANGUAGE_PREFERENCE: "LANGUAGE_PREFERENCE",
} as const;

type Key = [keyof typeof TopLevelKeys, ...string[]];

/**
 * Simple local/session storage based db abstraction
 *
 * @todo Consider using IndexedDB and other more robust alternatives
 */
export class DB {
  private static readonly STORAGE_PREFIX = "rosalind_";

  private static get rootKey(): string {
    const problemId = window.location.pathname;
    return DB.STORAGE_PREFIX + problemId;
  }

  private static get config(): Record<string, any> {
    try {
      const configString = localStorage.getItem(this.rootKey) ?? "{}";
      return JSON.parse(configString);
    } catch (e) {
      console.warn(e);
      return {};
    }
  }

  static save<T>(key: Key, value: T): void {
    try {
      const config = this.config;

      let current = config;
      let [last] = key.splice(-1, 1);
      for (let k of key) current = current[k] ??= {};
      current[last] = value;

      localStorage.setItem(this.rootKey, JSON.stringify(config));
    } catch (e) {
      console.error("Failed to save to localStorage:", e);
    }
  }

  static get<T>(key: Key): T | null | undefined {
    let value = this.config;
    const [last] = key.splice(-1, 1);
    for (let k of key) value = value[k] ?? {};
    return value[last];
  }
}
