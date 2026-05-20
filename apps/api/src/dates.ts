import * as chrono from "chrono-node";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function parseDateTime(input: string, referenceDate = new Date()): Date {
  const parsed = chrono.parseDate(input, referenceDate, { forwardDate: true });

  if (!parsed) {
    throw new Error(`Could not parse a date/time from "${input}".`);
  }

  return parsed;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function resolveDateRange(
  dateRange: string,
  referenceDate = new Date()
): { timeMin: Date; timeMax: Date; label: string } {
  const normalized = dateRange.trim().toLowerCase();
  const startOfToday = new Date(referenceDate);
  startOfToday.setHours(0, 0, 0, 0);

  if (!normalized || normalized === "today") {
    return {
      timeMin: startOfToday,
      timeMax: new Date(startOfToday.getTime() + DAY_MS),
      label: "today"
    };
  }

  if (normalized === "tomorrow") {
    const tomorrow = new Date(startOfToday.getTime() + DAY_MS);
    return {
      timeMin: tomorrow,
      timeMax: new Date(tomorrow.getTime() + DAY_MS),
      label: "tomorrow"
    };
  }

  if (normalized.includes("week")) {
    return {
      timeMin: referenceDate,
      timeMax: new Date(referenceDate.getTime() + 7 * DAY_MS),
      label: "the next 7 days"
    };
  }

  const parsed = parseDateTime(dateRange, referenceDate);
  const dayStart = new Date(parsed);
  dayStart.setHours(0, 0, 0, 0);

  return {
    timeMin: dayStart,
    timeMax: new Date(dayStart.getTime() + DAY_MS),
    label: dateRange
  };
}
