const MINUTE_IN_SECONDS = 60;
const HOUR_IN_SECONDS = 60 * MINUTE_IN_SECONDS;
const DAY_IN_SECONDS = 24 * HOUR_IN_SECONDS;

type ParsedAlarm = {
  delaySeconds: number;
  normalizedTime: string;
  targetDate: Date;
  rollsToTomorrow: boolean;
};

type ParsedTimer = {
  totalSeconds: number;
  normalizedDuration: string;
};

export function parseTimeOfDay(input: string, now = new Date()): ParsedAlarm {
  const value = input.trim().toLowerCase();
  const match = value.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i);

  if (!match) {
    throw new Error("Use a time like 7:30 am, 19:30, or 0730.");
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase();

  if (minutes > 59) {
    throw new Error("Minutes must be between 00 and 59.");
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      throw new Error("12-hour times must use an hour between 1 and 12.");
    }

    if (hours === 12) {
      hours = 0;
    }

    if (meridiem === "pm") {
      hours += 12;
    }
  } else if (hours > 23) {
    throw new Error("24-hour times must use an hour between 0 and 23.");
  }

  const targetDate = new Date(now);
  targetDate.setHours(hours, minutes, 0, 0);

  const rollsToTomorrow = targetDate.getTime() <= now.getTime();

  if (rollsToTomorrow) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const delaySeconds = Math.ceil((targetDate.getTime() - now.getTime()) / 1000);

  if (delaySeconds <= 0 || delaySeconds > DAY_IN_SECONDS) {
    throw new Error("Couldn't compute a valid next alarm time.");
  }

  return {
    delaySeconds,
    normalizedTime: formatClockTime(targetDate),
    targetDate,
    rollsToTomorrow,
  };
}

export function parseDuration(input: string): ParsedTimer {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    throw new Error("Enter a duration like 10m, 90s, or 1h 30m.");
  }

  const matcher =
    /(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)/g;
  let totalSeconds = 0;
  let matchedText = "";

  for (const match of normalized.matchAll(matcher)) {
    const value = Number(match[1]);
    const unit = match[2];
    matchedText += match[0];

    if (unit.startsWith("h")) {
      totalSeconds += value * HOUR_IN_SECONDS;
      continue;
    }

    if (unit.startsWith("m")) {
      totalSeconds += value * MINUTE_IN_SECONDS;
      continue;
    }

    totalSeconds += value;
  }

  const compactInput = normalized.replace(/\s+/g, "");
  const compactMatched = matchedText.replace(/\s+/g, "");

  if (totalSeconds === 0 || compactMatched !== compactInput) {
    throw new Error("Use a duration like 10m, 90s, 1h 30m, or 2 hours.");
  }

  return {
    totalSeconds,
    normalizedDuration: formatDuration(totalSeconds),
  };
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / HOUR_IN_SECONDS);
  const minutes = Math.floor(
    (totalSeconds % HOUR_IN_SECONDS) / MINUTE_IN_SECONDS,
  );
  const seconds = totalSeconds % MINUTE_IN_SECONDS;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
