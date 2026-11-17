import type { Candidate, ExtractContext, Extraction } from './types';

// A small, deliberately conservative fallback. This is pattern matching, not AI.
// It only suggests work; every result must be reviewed by the user.
const thaiAction = /(?:ส่ง|ซื้อ|ทัก|โทร|เช็[คก]|ทำ|เตรียม|ประชุม|จ่าย|นัด|อ่าน|เขียน|อัปเดต|อัพเดต|ตรวจ|ติดต่อ|จอง|ไปรับ|รับ(?:ของ|เอกสาร|พัสดุ|ลูก|เงิน|ยา|รถ)|เก็บ|ยื่น|จด|ตอบ|ซัก|ล้าง|ออกกำลังกาย)/;
const englishAction = /\b(?:send|buy|call|email|review|submit|prepare|pay|book|finish|update|check|create|schedule|meet|pick up|write|read|clean|reply|do|take|complete)\b/i;
const actionAfterSeparator = '(?:(?:อย่าลืม|ฝาก|ช่วย|ต้อง|ขอให้|เรา|ผม|ฉัน|พรุ่งนี้|วันนี้|มะรืน|please|remember to|don[’\x27]t forget to|then|tomorrow|today)\\s*)*(?:ส่ง|ซื้อ|ทัก|โทร|เช็[คก]|ทำ|เตรียม|ประชุม|จ่าย|นัด|อ่าน|เขียน|อัปเดต|อัพเดต|ตรวจ|ติดต่อ|จอง|รับ|เก็บ|ยื่น|จด|ตอบ|ซัก|ล้าง|ออกกำลังกาย|send\\b|buy\\b|call\\b|email\\b|review\\b|submit\\b|prepare\\b|pay\\b|book\\b|finish\\b|update\\b|check\\b|create\\b|schedule\\b|meet\\b|pick up\\b|write\\b|read\\b|clean\\b|reply\\b|do\\b|take\\b|complete\\b)';
const conjunction = new RegExp('(?:\\s*(?:แล้ว|และ|กับ)\\s*|\\s+(?:and(?: then)?|then)\\s+)(?=' + actionAfterSeparator + ')', 'giu');

function segments(text: string): string[] {
  // Removing a leading bullet still leaves evidence as a verbatim substring.
  return text.split(/[\r\n;；]+/).flatMap((line) => line.split(conjunction))
    .map((part) => part.replace(/^\s*(?:[-*•]\s*|\d+[.)]\s*)/, '').trim())
    .filter(Boolean);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function shiftDate(reference: string, days: number): string | null {
  if (!validDate(reference)) return null;
  const date = new Date(`${reference}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateDetails(evidence: string, context: ExtractContext) {
  const notes: string[] = [];
  let dueDate: string | null = null;
  let dueTime: string | null = null;
  const explicit = evidence.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (explicit) {
    if (validDate(explicit[0])) dueDate = explicit[0];
    else notes.push(context.locale === 'th' ? 'วันที่ในข้อความไม่ถูกต้อง' : 'The date in the message is invalid');
  } else if (/มะรืน|\bday after tomorrow\b/i.test(evidence)) {
    dueDate = shiftDate(context.referenceDate, 2);
  } else if (/พรุ่งนี้|\btomorrow\b/i.test(evidence)) {
    dueDate = shiftDate(context.referenceDate, 1);
  } else if (/วันนี้|\btoday\b/i.test(evidence)) {
    dueDate = shiftDate(context.referenceDate, 0);
  }
  if (!dueDate && /(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์|สัปดาห์หน้า|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b)/i.test(evidence)) {
    notes.push(context.locale === 'th' ? 'กรุณายืนยันวันที่ที่หมายถึง' : 'Please confirm the intended date');
  }
  if (/ก่อนเที่ยง|\b(?:before|by) noon\b/i.test(evidence)) {
    dueTime = '12:00';
    notes.push(context.locale === 'th' ? '12:00 คือกำหนดส่ง ไม่ใช่เวลาลงมือทำ' : '12:00 is a deadline, not a work start time');
  } else {
    const clock = evidence.match(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
    if (clock) dueTime = `${clock[1].padStart(2, '0')}:${clock[2]}`;
  }
  if (/(?:เย็น ๆ|เย็นๆ|บ่าย ๆ|บ่ายๆ|เช้า ๆ|เช้าๆ|ค่ำ ๆ|ค่ำๆ|\b(?:in the evening|in the morning|in the afternoon)\b)/i.test(evidence)) {
    notes.push(context.locale === 'th' ? 'ยังไม่ได้ระบุเวลาที่แน่นอน' : 'No exact time was specified');
  }
  return { dueDate, dueTime, notes };
}

function isCompletedOrNotARequest(evidence: string): boolean {
  if (/(?:เรียบร้อยแล้ว|ทำเสร็จแล้ว|ส่งเสร็จแล้ว|จ่ายแล้ว|ซื้อแล้ว|ส่งแล้ว|เสร็จแล้ว|ไม่ต้องทำ|ไม่ต้องส่ง|ไม่ต้องซื้อ)/.test(evidence)) return true;
  if (/\b(?:already (?:sent|done|finished|paid|bought|completed)|(?:sent|done|finished|paid|bought|completed) already|no need to|do not (?:send|buy|call|do)|don't (?:send|buy|call|do))\b/i.test(evidence)) return true;
  // A status statement beginning with a past-tense verb is not new work.
  if (/^(?:i |we |he |she |they )?(?:sent|bought|paid|finished|completed|called|emailed)\b/i.test(evidence)) return true;
  return false;
}

function makeTitle(evidence: string): string {
  return evidence
    .replace(/^(?:อย่าลืม|ฝาก|ช่วย|ขอให้|ต้อง|please\s+|remember to\s+|don[’']t forget to\s+|i need to\s+|we need to\s+)+/i, '')
    .replace(/^(?:พรุ่งนี้|วันนี้|มะรืน|tomorrow\b|today\b)\s*/i, '')
    .replace(/^(?:อย่าลืม|ฝาก|ช่วย|ขอให้|ต้อง|please\s+)+/i, '')
    .replace(/(?:ด้วยนะ|หน่อยนะ|ด้วยครับ|ด้วยค่ะ|ด้วย|นะครับ|นะคะ|นะ|ครับ|ค่ะ)[.!?。]?$/u, '')
    .trim() || evidence;
}

export function extractBasic(text: string, context: ExtractContext): Extraction {
  const started = performance.now();
  const candidates: Candidate[] = [];
  for (const evidence of segments(text)) {
    if (isCompletedOrNotARequest(evidence)) continue;
    if (!thaiAction.test(evidence) && !englishAction.test(evidence)) continue;
    const { dueDate, dueTime, notes } = dateDetails(evidence, context);
    const prefix = context.locale === 'th'
      ? 'แยกด้วยกฎพื้นฐาน กรุณาตรวจงานและวันที่'
      : 'Extracted with basic rules. Please review the task and date';
    candidates.push({
      id: crypto.randomUUID(),
      title: makeTitle(evidence),
      dueDate,
      dueTime,
      evidence,
      needsReview: true,
      reviewReason: [prefix, ...notes].join(' · '),
    });
  }
  return { candidates, engine: 'basic', durationMs: performance.now() - started };
}
