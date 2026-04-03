import { LocalStorage } from "@raycast/api";

import type { NotificationState, ScanResult, ThresholdRule } from "./types";

const RULES_STORAGE_KEY = "memory-sentinel.rules";
const LAST_SCAN_STORAGE_KEY = "memory-sentinel.last-scan";
const NOTIFICATION_STATE_STORAGE_KEY = "memory-sentinel.notification-state";

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await LocalStorage.getItem<string>(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getRules(): Promise<ThresholdRule[]> {
  const rules = await readJson<ThresholdRule[]>(RULES_STORAGE_KEY, []);
  return Array.isArray(rules) ? rules : [];
}

export async function saveRules(rules: ThresholdRule[]): Promise<void> {
  await LocalStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

export async function getLastScanResult(): Promise<ScanResult | undefined> {
  return readJson<ScanResult | undefined>(LAST_SCAN_STORAGE_KEY, undefined);
}

export async function saveLastScanResult(scanResult: ScanResult): Promise<void> {
  await LocalStorage.setItem(LAST_SCAN_STORAGE_KEY, JSON.stringify(scanResult));
}

export async function getNotificationState(): Promise<NotificationState> {
  const state = await readJson<NotificationState>(NOTIFICATION_STATE_STORAGE_KEY, {});
  return typeof state === "object" && state ? state : {};
}

export async function saveNotificationState(state: NotificationState): Promise<void> {
  await LocalStorage.setItem(NOTIFICATION_STATE_STORAGE_KEY, JSON.stringify(state));
}
