import type { Data } from './store';

export interface ResultCalendarMark { taskId: string; date: string; time: string }

/** Mark only tasks belonging to this extraction, after the whole selection validates. */
export function markResultTasks(data: Data, captureId: string, marks: ResultCalendarMark[]): void {
  if (!marks.length) throw new Error('Select at least one task.');
  const seen = new Set<string>();
  for (const mark of marks) {
    if (seen.has(mark.taskId)) throw new Error('A task was selected more than once.');
    seen.add(mark.taskId);
    const task = data.tasks.find(item => item.id === mark.taskId && item.captureId === captureId);
    if (!task) throw new Error('A task is no longer available.');
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(mark.date) ? new Date(`${mark.date}T00:00:00Z`) : new Date(NaN);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== mark.date) throw new Error('Choose a valid date for every selected task.');
    if (mark.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(mark.time)) throw new Error('Choose a valid time.');
  }
  for (const mark of marks) {
    const task = data.tasks.find(item => item.id === mark.taskId && item.captureId === captureId)!;
    task.calendarDate = mark.date;
    if (mark.time) task.calendarTime = mark.time; else delete task.calendarTime;
  }
}
