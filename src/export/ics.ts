/** RFC 5545 calendar of 1099 deadlines. Pure. */

export interface DeadlineEvent {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  note: string;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (curLen + len > limit) {
      parts.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export function buildIcs(events: DeadlineEvent[], opts: { domain: string; stamp: string; reminderDays?: number[] }): string {
  const reminders = opts.reminderDays ?? [14, 3];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${opts.domain}//1099 deadlines//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}-${e.date}@${opts.domain}`,
      `DTSTAMP:${opts.stamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${escapeText(e.label)}`,
      `DESCRIPTION:${escapeText(`${e.note ? `${e.note} ` : ''}Not tax advice; confirm at irs.gov.`)}`,
    );
    for (const d of reminders) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.label)}`, `TRIGGER:-P${d}D`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
