import { updateCommandMetadata } from "@raycast/api";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { getMonitorPreferences } from "./preferences";
import { getRunningProcessGroups } from "./processes";
import { getLastScanResult, getNotificationState, getRules, saveLastScanResult, saveNotificationState } from "./storage";
import type { FlaggedProcessGroup, NotificationState, ProcessGroup, ScanResult, ThresholdRule } from "./types";

const execFileAsync = promisify(execFile);

function compareRules(left: ThresholdRule, right: ThresholdRule): number {
  const leftExact = left.matchType === "exact" ? 1 : 0;
  const rightExact = right.matchType === "exact" ? 1 : 0;
  if (leftExact !== rightExact) {
    return rightExact - leftExact;
  }

  const lengthDifference = right.pattern.length - left.pattern.length;
  if (lengthDifference !== 0) {
    return lengthDifference;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function getMatchingRule(group: ProcessGroup, rules: ThresholdRule[]): ThresholdRule | undefined {
  const normalizedName = group.name.toLowerCase();

  return rules
    .filter((rule) => {
      const pattern = rule.pattern.trim().toLowerCase();
      if (!pattern) {
        return false;
      }

      return rule.matchType === "exact" ? normalizedName === pattern : normalizedName.includes(pattern);
    })
    .sort(compareRules)[0];
}

function toThresholdBytes(rule: ThresholdRule | undefined, fallbackThresholdBytes: number): number | undefined {
  if (!rule) {
    return fallbackThresholdBytes;
  }

  if (rule.mode === "ignore") {
    return undefined;
  }

  if (!rule.thresholdGb || !Number.isFinite(rule.thresholdGb) || rule.thresholdGb <= 0) {
    return fallbackThresholdBytes;
  }

  return rule.thresholdGb * 1024 * 1024 * 1024;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex >= 3 ? 2 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function buildNotificationKey(group: FlaggedProcessGroup): string {
  return `${group.key}:${Math.round(group.thresholdBytes)}`;
}

async function sendSystemNotification(flaggedGroups: FlaggedProcessGroup[]): Promise<void> {
  if (flaggedGroups.length === 0) {
    return;
  }

  const sortedGroups = [...flaggedGroups].sort((left, right) => right.totalRssBytes - left.totalRssBytes);
  const title = "Memory Sentinel";
  const subtitle =
    flaggedGroups.length === 1 ? "1 process is above its memory limit" : `${flaggedGroups.length} processes are above their memory limits`;
  const body = sortedGroups
    .slice(0, 3)
    .map((group) => `${group.name} (${formatBytes(group.totalRssBytes)})`)
    .join(", ");
  const escapedTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedSubtitle = subtitle.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedBody = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  await execFileAsync("/usr/bin/osascript", [
    "-e",
    `display notification "${escapedBody}" with title "${escapedTitle}" subtitle "${escapedSubtitle}"`,
  ]);
}

async function getGroupsToNotify(
  flaggedGroups: FlaggedProcessGroup[],
  cooldownMs: number,
): Promise<{ groupsToNotify: FlaggedProcessGroup[]; nextState: NotificationState }> {
  const notificationState = await getNotificationState();
  const nextState = { ...notificationState };
  const now = Date.now();

  const groupsToNotify = flaggedGroups.filter((group) => {
    const key = buildNotificationKey(group);
    const lastNotification = notificationState[key] ? Date.parse(notificationState[key]) : Number.NaN;
    const shouldNotify = !Number.isFinite(lastNotification) || now - lastNotification >= cooldownMs;

    if (shouldNotify) {
      nextState[key] = new Date(now).toISOString();
    }

    return shouldNotify;
  });

  return { groupsToNotify, nextState };
}

export async function scanMemoryUsage(options?: { notify?: boolean; updateMetadata?: boolean }): Promise<{
  result: ScanResult;
  notifiedGroups: FlaggedProcessGroup[];
}> {
  const preferences = getMonitorPreferences();
  const [groups, rules] = await Promise.all([getRunningProcessGroups(), getRules()]);

  const flagged = groups.reduce<FlaggedProcessGroup[]>((accumulator, group) => {
    const matchingRule = getMatchingRule(group, rules);
    const thresholdBytes = toThresholdBytes(matchingRule, preferences.defaultThresholdBytes);

    if (!thresholdBytes || group.totalRssBytes < thresholdBytes) {
      return accumulator;
    }

    accumulator.push({
      ...group,
      thresholdBytes,
      thresholdGb: thresholdBytes / 1024 / 1024 / 1024,
      matchedRule: matchingRule,
    });

    return accumulator;
  }, []);

  const result: ScanResult = {
    scannedAt: new Date().toISOString(),
    defaultThresholdGb: preferences.defaultThresholdGb,
    cooldownMinutes: preferences.notificationCooldownMinutes,
    groups,
    flagged,
  };

  await saveLastScanResult(result);

  let notifiedGroups: FlaggedProcessGroup[] = [];
  if (options?.notify) {
    const notificationDecision = await getGroupsToNotify(flagged, preferences.notificationCooldownMs);
    notifiedGroups = notificationDecision.groupsToNotify;

    if (notifiedGroups.length > 0) {
      await sendSystemNotification(notifiedGroups);
      await saveNotificationState(notificationDecision.nextState);
    }
  }

  if (options?.updateMetadata) {
    await updateCommandMetadata({
      subtitle: flagged.length > 0 ? `${flagged.length} process${flagged.length === 1 ? "" : "es"} above limit` : "All clear",
    });
  }

  return { result, notifiedGroups };
}

export { formatBytes };
export { getLastScanResult };
