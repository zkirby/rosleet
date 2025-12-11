/**
 * Simple local/session storage based db abstraction
 *
 * @todo Consider using IndexedDB and other more robust alternatives
 */
export class DB {
  private static readonly STORAGE_PREFIX = "rosalind_";
  public static readonly KEYS = {
    CODE: "CODE",
    LANGUAGE_PREFERENCE: "LANGUAGE_PREFERENCE",
  } as const;

  private static key(key: keyof typeof DB.KEYS): string {
    return DB.STORAGE_PREFIX + DB.problemId + "_" + key;
  }

  static get problemId(): string {
    return window.location.pathname;
  }

  static save(key: keyof typeof DB.KEYS, code: string) {
    try {
      localStorage.setItem(DB.key(key), code);
    } catch (e) {
      console.error("Failed to save to localStorage:", e);
    }
  }

  static get<T>(key: keyof typeof DB.KEYS, defaultValue: T): T;
  static get<T>(
    key: keyof typeof DB.KEYS,
    defaultValue: T | null = null
  ): T | null {
    try {
      return (localStorage.getItem(DB.key(key)) as T) ?? defaultValue;
    } catch (e) {
      console.error("Failed to get from localStorage:", e);
      return defaultValue;
    }
  }
}
