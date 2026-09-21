"use client";

import { useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

/** Small localStorage-backed store usable with useSyncExternalStore (hydration-safe). */
export function useLocalValue<T>(key: string, fallback: T): [T, (next: T) => void] {
  const subscribe = (cb: () => void) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(cb);
    const onStorage = (e: StorageEvent) => e.key === key && cb();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.get(key)?.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  };
  const getSnapshot = () => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  let value = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  const set = (next: T) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage unavailable: keep in-memory behaviour */
    }
    emit(key);
  };
  return [value, set];
}
