const FALLBACK = "—";
const SECOND_MS = 1_000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const WEEK_SECONDS = 7 * DAY_SECONDS;

type FormatOptions = {
  fallback?: string;
};

type DurationOptions = FormatOptions & {
  style?: "short" | "full";
};

type CountOptions = FormatOptions & {
  compact?: boolean;
};

type CurrencyOptions = FormatOptions & {
  currency?: string | null;
};

const exactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateTime = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
  timeZoneName: "short",
});

const validNonNegativeNumber = (
  value: number | null | undefined,
): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const fallback = (options?: FormatOptions): string =>
  options?.fallback ?? FALLBACK;

const formatDecimal = (value: number, maximumFractionDigits: number): string =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);

const append = (parts: string[], value: number, unit: string) => {
  if (value > 0) parts.push(`${exactNumber.format(value)}${unit}`);
};

const formatFullDurationMs = (milliseconds: number): string => {
  if (milliseconds < SECOND_MS) return `${Math.round(milliseconds)} ms`;

  let remainingSeconds = Math.floor(milliseconds / SECOND_MS);
  let remainderMs = Math.round(milliseconds % SECOND_MS);
  if (remainderMs === SECOND_MS) {
    remainingSeconds += 1;
    remainderMs = 0;
  }
  const weeks = Math.floor(remainingSeconds / WEEK_SECONDS);
  remainingSeconds %= WEEK_SECONDS;
  const days = Math.floor(remainingSeconds / DAY_SECONDS);
  remainingSeconds %= DAY_SECONDS;
  const hours = Math.floor(remainingSeconds / HOUR_SECONDS);
  remainingSeconds %= HOUR_SECONDS;
  const minutes = Math.floor(remainingSeconds / MINUTE_SECONDS);
  const seconds = remainingSeconds % MINUTE_SECONDS;
  const parts: string[] = [];
  append(parts, weeks, "w");
  append(parts, days, "d");
  append(parts, hours, "h");
  append(parts, minutes, "m");
  if (seconds > 0 || remainderMs > 0 || parts.length === 0) {
    const preciseSeconds = seconds + remainderMs / SECOND_MS;
    parts.push(`${formatDecimal(preciseSeconds, 3)}s`);
  }
  return parts.join(" ");
};

const formatShortDurationMs = (milliseconds: number): string => {
  if (milliseconds < SECOND_MS) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < MINUTE_SECONDS * SECOND_MS) {
    const seconds = milliseconds / SECOND_MS;
    return `${formatDecimal(seconds, seconds < 10 ? 2 : 1)}s`;
  }

  const totalSeconds = Math.round(milliseconds / SECOND_MS);
  if (totalSeconds < HOUR_SECONDS) {
    const minutes = Math.floor(totalSeconds / MINUTE_SECONDS);
    const seconds = totalSeconds % MINUTE_SECONDS;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (totalSeconds < DAY_SECONDS) {
    const hours = Math.floor(totalSeconds / HOUR_SECONDS);
    const minutes = Math.floor((totalSeconds % HOUR_SECONDS) / MINUTE_SECONDS);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (totalSeconds < WEEK_SECONDS) {
    const days = Math.floor(totalSeconds / DAY_SECONDS);
    const hours = Math.floor((totalSeconds % DAY_SECONDS) / HOUR_SECONDS);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  const weeks = Math.floor(totalSeconds / WEEK_SECONDS);
  const days = Math.floor((totalSeconds % WEEK_SECONDS) / DAY_SECONDS);
  return days > 0
    ? `${exactNumber.format(weeks)}w ${days}d`
    : `${exactNumber.format(weeks)}w`;
};

export function formatDurationMs(
  value: number | null | undefined,
  options?: DurationOptions,
): string {
  if (!validNonNegativeNumber(value)) return fallback(options);
  return options?.style === "full"
    ? formatFullDurationMs(value)
    : formatShortDurationMs(value);
}

export function formatDurationSeconds(
  value: number | null | undefined,
  options?: DurationOptions,
): string {
  if (!validNonNegativeNumber(value)) return fallback(options);
  return formatDurationMs(value * SECOND_MS, options);
}

export function formatRelativeTime(
  value: string | number | Date,
  now = Date.now(),
  options?: FormatOptions,
): string {
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) {
    return fallback(options);
  }
  const deltaSeconds = Math.floor((now - timestamp) / SECOND_MS);
  const future = deltaSeconds < 0;
  const absoluteSeconds = Math.abs(deltaSeconds);
  let valueLabel: string;
  if (absoluteSeconds < MINUTE_SECONDS) {
    valueLabel = `${absoluteSeconds}s`;
  } else if (absoluteSeconds < HOUR_SECONDS) {
    valueLabel = `${Math.floor(absoluteSeconds / MINUTE_SECONDS)}m`;
  } else if (absoluteSeconds < DAY_SECONDS) {
    valueLabel = `${Math.floor(absoluteSeconds / HOUR_SECONDS)}h`;
  } else if (absoluteSeconds < WEEK_SECONDS) {
    valueLabel = `${Math.floor(absoluteSeconds / DAY_SECONDS)}d`;
  } else {
    valueLabel = `${exactNumber.format(Math.floor(absoluteSeconds / WEEK_SECONDS))}w`;
  }
  return future ? `in ${valueLabel}` : `${valueLabel} ago`;
}

export function formatCount(
  value: number | null | undefined,
  options?: CountOptions,
): string {
  if (!validNonNegativeNumber(value)) return fallback(options);
  if (options?.compact === false || value < 1_000) {
    return exactNumber.format(value);
  }
  return compactNumber.format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  options?: CurrencyOptions,
): string {
  if (!validNonNegativeNumber(value)) return fallback(options);
  const currency = /^[A-Z]{3}$/.test(options?.currency ?? "")
    ? (options?.currency ?? "USD")
    : "USD";
  const absolute = Math.abs(value);
  const maximumFractionDigits =
    absolute === 0 || absolute >= 1 ? 2 : absolute >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: absolute === 0 || absolute >= 1 ? 2 : 2,
    maximumFractionDigits,
  }).format(value);
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  options?: FormatOptions,
): string {
  if (value === null || value === undefined) return fallback(options);
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback(options);
  return dateTime.format(date);
}
