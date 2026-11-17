import type { Task } from './types';
interface GoogleToken { access_token?: string; error?: string; }
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient(options: {
      client_id: string; scope: string; callback: (token: GoogleToken) => void;
      error_callback: (error: {type:string}) => void;
    }): { requestAccessToken(options?: {prompt:string}):void } } } };
  }
}
let loader: Promise<void> | null = null;
let token: string | null = null;
/** Keep links for the legacy setup and signed-in accounts separate. */
export function calendarEventStorageKey(taskId: string, userId: string | null): string {
  return userId === null ? `diao-tham.calendar.${taskId}` : `diao-tham.calendar.v2.${userId}.${taskId}`;
}
/** Google OAuth access token is intentionally memory-only. */
export function setCalendarToken(value: string | null): void { token = value; }
export function prepareCalendar(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loader = null; script.remove(); reject(new Error('Could not load Google. Check your connection and try again.')); };
    document.head.append(script);
  });
  return loader;
}
export function authorizeCalendar(clientId: string): Promise<void> {
  if (!clientId) return Promise.reject(new Error('Google OAuth client ID is not configured.'));
  if (!window.google) return Promise.reject(new Error('Google is still loading. Wait a moment and try again.'));
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.events.owned',
      callback: (result) => {
        if (result.error || !result.access_token) { reject(new Error('Calendar access has not been granted.')); return; }
        token = result.access_token;
        resolve();
      },
      error_callback: () => reject(new Error('Connection window closed. Your task is still saved in the app.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}
export function isCalendarConnected(): boolean { return token !== null; }
export async function addCalendarEvent(task: Task, start: string, end: string, timeZone: string): Promise<string> {
  if (!token) throw new Error('Connect Google Calendar first.');
  // Stable UUID-derived event id keeps retries idempotent, including after reload.
  const eventId = `dt${task.id.replace(/-/g, '').toLowerCase()}`;
  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const response = await fetch(base, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ id:eventId, summary:task.title,
      description:'Work session · added from Diao Tham',
      start:{ dateTime: new Date(start).toISOString(), timeZone },
      end:{ dateTime: new Date(end).toISOString(), timeZone },
    }),
  });
  if (response.status === 401) { token = null; throw new Error('Your connection expired. Reconnect Google and try again.'); }
  if (response.status === 403) { token = null; throw new Error('Google Calendar access was denied or is not enabled. Reconnect Google and check Calendar permissions.'); }
  if (response.status === 409) {
    const existing = await fetch(`${base}/${eventId}`, {headers:{Authorization:`Bearer ${token}`}});
    if (!existing.ok) throw new Error('This event may already exist. Please check Google Calendar.');
    const result = await existing.json();
    if (new Date(result.start?.dateTime).getTime() !== new Date(start).getTime() ||
        new Date(result.end?.dateTime).getTime() !== new Date(end).getTime()) {
      throw new Error('This task is already scheduled. Change its time directly in Google Calendar.');
    }
    return result.htmlLink;
  }
  if (!response.ok) throw new Error(`Could not add to Calendar (${response.status}). Your task is still saved.`);
  const result = await response.json();
  return result.htmlLink;
}

/** Result of an explicitly requested sync for one marked task. */
export interface CalendarSyncResult {
  taskId: string;
  title: string;
  status: 'created' | 'updated' | 'failed';
  eventLink?: string;
  error?: string;
}

type EventTime = { date: string } | { dateTime: string; timeZone: string };
type MarkedEvent = {
  id: string;
  summary: string;
  start: EventTime;
  end: EventTime;
  extendedProperties: { private: { diaoThamTaskId: string; diaoThamKind: string } };
};
const markedEventKind = 'marked-calendar-v1';
const eventsUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

function calendarDay(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid calendar date.');
  const year = Number(date.slice(0, 4));
  if (year < 1000 || year > 9998) throw new Error('Choose a supported calendar date.');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid calendar date.');
  return parsed;
}

/** Resolve a wall-clock time in the selected zone without using the computer's local zone. */
function resolveZonedStart(date: string, time: string, timeZone: string): Date {
  const day = calendarDay(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid calendar time.');
  const wallTime = day.getTime() + Number(time.slice(0, 2)) * 3_600_000 + Number(time.slice(3)) * 60_000;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  } catch { throw new Error('Choose a valid time zone.'); }
  const wallAt = (instant: number) => {
    const values: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(instant))) {
      if (['year', 'month', 'day', 'hour', 'minute'].includes(part.type)) values[part.type] = Number(part.value);
    }
    return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
  };
  // Gather zone offsets around the date. Checking the candidate against the
  // original wall time detects gaps and ambiguous times at DST transitions.
  const offsets = new Set<number>();
  for (const hours of [-48, -24, 0, 24, 48]) {
    const sample = wallTime + hours * 3_600_000;
    offsets.add(wallAt(sample) - sample);
  }
  const matches = [...offsets].map(offset => wallTime - offset).filter(instant => wallAt(instant) === wallTime);
  const unique = [...new Set(matches)];
  if (unique.length !== 1) throw new Error('This time is missing or ambiguous in the selected time zone. Choose another time.');
  return new Date(unique[0]);
}

/** Build only the event data shown in the sync confirmation; no network calls. */
export function markedEventForTask(task: Task, timeZone: string): MarkedEvent {
  if (!task.calendarDate) throw new Error('Choose a date before syncing this task.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.id)) {
    throw new Error('This task cannot be safely synced because its identifier is invalid.');
  }
  if (!task.title.trim()) throw new Error('Add a task title before syncing.');
  const day = calendarDay(task.calendarDate);
  let start: EventTime;
  let end: EventTime;
  if (task.calendarTime) {
    const instant = resolveZonedStart(task.calendarDate, task.calendarTime, timeZone);
    start = { dateTime: instant.toISOString(), timeZone };
    end = { dateTime: new Date(instant.getTime() + 30 * 60_000).toISOString(), timeZone };
  } else {
    start = { date: task.calendarDate };
    end = { date: new Date(day.getTime() + 86_400_000).toISOString().slice(0, 10) };
  }
  return {
    // Separate from the older work-session IDs, so sync cannot overwrite them.
    id: `dtm${task.id.replace(/-/g, '').toLowerCase()}`,
    summary: task.title.trim(), start, end,
    extendedProperties: { private: { diaoThamTaskId: task.id, diaoThamKind: markedEventKind } },
  };
}

/**
 * Explicit user-initiated sync. Only marked tasks are sent to the currently
 * connected primary calendar; no event is ever deleted. A failed item never
 * prevents reporting the results for the rest of the selected tasks.
 */
export async function syncMarkedTasks(tasks: Task[], timeZone: string): Promise<CalendarSyncResult[]> {
  const activeToken = token;
  const results: CalendarSyncResult[] = [];
  const seen = new Set<string>();
  const request = async (url: string, options: RequestInit = {}): Promise<Response> => {
    if (!activeToken || token !== activeToken) throw new Error('Connect Google Calendar again before syncing.');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${activeToken}` },
    });
    if (response.status === 401 || response.status === 403) {
      if (token === activeToken) token = null;
      throw new Error('Calendar access expired or was denied. Reconnect Google and try again.');
    }
    return response;
  };
  for (const task of tasks) {
    if (!task.calendarDate || seen.has(task.id)) continue;
    seen.add(task.id);
    const base = { taskId: task.id, title: task.title };
    try {
      const event = markedEventForTask(task, timeZone);
      const inserted = await request(eventsUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event),
      });
      if (inserted.ok) {
        const data = await inserted.json() as { htmlLink?: unknown };
        results.push({ ...base, status: 'created', ...(typeof data.htmlLink === 'string' ? { eventLink: data.htmlLink } : {}) });
        continue;
      }
      if (inserted.status !== 409) throw new Error(`Could not create this event (${inserted.status}).`);
      const eventUrl = `${eventsUrl}/${event.id}`;
      const found = await request(eventUrl);
      if (!found.ok) throw new Error(`Could not check the existing event (${found.status}).`);
      const existing = await found.json() as { etag?: unknown; extendedProperties?: { private?: Record<string, unknown> } };
      if (existing.extendedProperties?.private?.diaoThamTaskId !== task.id || existing.extendedProperties?.private?.diaoThamKind !== markedEventKind) {
        throw new Error('An unrelated event already uses this ID; it was not changed.');
      }
      if (typeof existing.etag !== 'string' || !existing.etag) throw new Error('Could not safely update the existing event.');
      const updated = await request(eventUrl, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': existing.etag },
        body: JSON.stringify({ summary: event.summary, start: event.start, end: event.end }),
      });
      if (!updated.ok) throw new Error(updated.status === 412 ? 'The event changed during sync. Please try again.' : `Could not update this event (${updated.status}).`);
      const data = await updated.json() as { htmlLink?: unknown };
      results.push({ ...base, status: 'updated', ...(typeof data.htmlLink === 'string' ? { eventLink: data.htmlLink } : {}) });
    } catch (error) {
      results.push({ ...base, status: 'failed', error: error instanceof Error ? error.message : 'Could not sync this event.' });
    }
  }
  return results;
}
