export const pagesDemoPrefix = (pathname = location.pathname) => 'sa-pages-demo-v1:' + pathname.replace(/\/[^/]*\.html$/, '/').replace(/\/$/, '') + ':';

/** Namespace every demo key because github.io hosts other projects on the same origin. */
export function pagesDemoStorage(storage: Storage = localStorage, pathname = location.pathname): Storage {
  const prefix = pagesDemoPrefix(pathname);
  const keys = () => Array.from({length: storage.length}, (_, index) => storage.key(index)).filter((key): key is string => !!key && key.startsWith(prefix));
  return {
    get length() { return keys().length; },
    key(index) { return keys()[index]?.slice(prefix.length) ?? null; },
    getItem(key) { return storage.getItem(prefix + key); },
    setItem(key, value) { storage.setItem(prefix + key, value); },
    removeItem(key) { storage.removeItem(prefix + key); },
    clear() { for (const key of keys()) storage.removeItem(key); },
  };
}
