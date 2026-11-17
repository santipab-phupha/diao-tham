import type { Capture, Task } from './types';

export interface Data { version: 1; captures: Capture[]; tasks: Task[] }
const KEY = 'diao-tham.data.v1';

/** Another tab changed the saved snapshot after this tab loaded it. */
export class StaleDataError extends Error {
  constructor() {
    super('Saved data changed in another tab. Your change was not saved.');
    this.name = 'StaleDataError';
  }
}
export function loadData(): Data {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { version: 1, captures: [], tasks: [] };
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.captures) || !Array.isArray(data.tasks)) throw new Error('shape');
    return data;
  } catch {
    throw new Error('Saved data could not be read. It has not been overwritten. Back up your browser data first.');
  }
}
export function saveData(data: Data): void {
  // Synchronous commit: only show success after the browser confirms the write.
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function commit(data: Data, patch: (copy: Data) => void): Data {
  // Never blindly overwrite another tab's completed write with an older snapshot.
  // This detects stale tabs; localStorage does not provide an atomic compare-and-swap,
  // so this alone cannot serialize writes that occur truly simultaneously.
  const saved = loadData();
  if (JSON.stringify(saved) !== JSON.stringify(data)) throw new StaleDataError();
  const copy = structuredClone(data);
  patch(copy);
  saveData(copy);
  return copy;
}
