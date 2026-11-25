/**
 * Date helpers for the calendar view. Days are local calendar dates written
 * as YYYY-MM-DD, the same form due dates take (they are stored at UTC
 * midnight, so `task.dueDate.slice(0, 10)` is the day). Months are YYYY-MM.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** A local Date as YYYY-MM-DD. */
export const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { year: y!, monthIndex: m! - 1 };
};

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const currentMonth = () => dayString(new Date()).slice(0, 7);

/** The month `by` months after `month` (negative goes back). */
export const shiftMonth = (month: string, by: number) => {
  const { year, monthIndex } = parseMonth(month);
  const d = new Date(year, monthIndex + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const monthTitle = (month: string) => {
  const { year, monthIndex } = parseMonth(month);
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

/** Weekday names in grid order: weeks start on Monday. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface CalendarDay {
  day: string;
  /** Day of the month, 1–31. */
  date: number;
  inMonth: boolean;
  weekend: boolean;
}

/**
 * The weeks shown for a month: Monday to Sunday, starting with the week that
 * holds the 1st and ending with the week that holds the last day, so 4–6 rows.
 */
export const monthWeeks = (month: string): CalendarDay[][] => {
  const { year, monthIndex } = parseMonth(month);
  const first = new Date(year, monthIndex, 1);
  // getDay(): 0 is Sunday. Step back to that week's Monday.
  const start = new Date(year, monthIndex, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, monthIndex + 1, 0);
  const weeks: CalendarDay[][] = [];
  for (let cursor = start; cursor <= last; ) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        day: dayString(cursor),
        date: cursor.getDate(),
        inMonth: cursor.getMonth() === monthIndex,
        weekend: i >= 5,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
};

/** "Monday, November 21" for a YYYY-MM-DD day. */
export const longDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};

/** The API value for a due date on `day`. */
export const dueDateFor = (day: string) => `${day}T00:00:00.000Z`;
