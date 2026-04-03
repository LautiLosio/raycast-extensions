import { getPreferenceValues } from "@raycast/api";

const DEFAULT_THRESHOLD_GB = 1;
const DEFAULT_COOLDOWN_MINUTES = 60;

interface RawPreferences {
  defaultThresholdGb?: string;
  notificationCooldownMinutes?: string;
}

export interface MonitorPreferences {
  defaultThresholdGb: number;
  defaultThresholdBytes: number;
  notificationCooldownMinutes: number;
  notificationCooldownMs: number;
}

function toPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function toBytesFromGb(valueGb: number): number {
  return valueGb * 1024 * 1024 * 1024;
}

export function getMonitorPreferences(): MonitorPreferences {
  const values = getPreferenceValues<RawPreferences>();
  const defaultThresholdGb = toPositiveNumber(values.defaultThresholdGb, DEFAULT_THRESHOLD_GB);
  const notificationCooldownMinutes = toPositiveNumber(
    values.notificationCooldownMinutes,
    DEFAULT_COOLDOWN_MINUTES,
  );

  return {
    defaultThresholdGb,
    defaultThresholdBytes: toBytesFromGb(defaultThresholdGb),
    notificationCooldownMinutes,
    notificationCooldownMs: notificationCooldownMinutes * 60 * 1000,
  };
}
