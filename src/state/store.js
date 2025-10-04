export function createStore(initialState = {}) {
  const state = { ...initialState };
  const listeners = new Map();

  function get(key) {
    return state[key];
  }

  function set(key, value) {
    const previous = state[key];
    state[key] = value;
    if (previous === value) return value;
    const setListeners = listeners.get(key);
    if (setListeners) {
      for (const listener of setListeners) {
        try {
          listener(value, { ...state });
        } catch (error) {
          console.error('[Store] listener error', error);
        }
      }
    }
    return value;
  }

  function subscribe(key, listener) {
    if (typeof listener !== 'function') return () => {};
    const setListeners = listeners.get(key);
    if (setListeners) {
      setListeners.add(listener);
    } else {
      listeners.set(key, new Set([listener]));
    }
    return () => {
      const current = listeners.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        listeners.delete(key);
      }
    };
  }

  function snapshot() {
    return { ...state };
  }

  return {
    get,
    set,
    subscribe,
    snapshot
  };
}
