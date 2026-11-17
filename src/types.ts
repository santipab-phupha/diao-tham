export type Locale = 'th' | 'en';
export type Engine = 'basic' | 'device' | 'cloud';
export interface Candidate {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  evidence: string;
  needsReview: boolean;
  reviewReason: string;
}
export interface Capture {
  id: string;
  text: string;
  referenceDate: string;
  timeZone: string;
  createdAt: string;
  status: 'pending' | 'reviewed';
  reviewDraft?: { extraction: Extraction; selectedIds: string[] };
}
export interface Task extends Candidate {
  captureId: string;
  createdAt: string;
  completedAt: string | null;
  engine: Engine;
  /** A date the user explicitly marked in the in-app calendar, separate from the deadline. */
  calendarDate?: string;
  calendarTime?: string;
}
export interface ExtractContext {
  referenceDate: string;
  timeZone: string;
  locale: Locale;
}
export interface Extraction {
  candidates: Candidate[];
  engine: Engine;
  durationMs: number;
}
