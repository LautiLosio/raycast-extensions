import { promisify } from "node:util";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ProcessEntry, ProcessGroup } from "./types";

const execFileAsync = promisify(execFile);
const iconPathCache = new Map<string, string | null>();

function toProcessName(executablePath: string): string {
  const baseName = path.basename(executablePath.trim());
  return baseName || executablePath.trim();
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveIconPath(executablePaths: string[]): Promise<string | undefined> {
  for (const executablePath of executablePaths) {
    const trimmedPath = executablePath.trim();
    if (!trimmedPath) {
      continue;
    }

    const cachedPath = iconPathCache.get(trimmedPath);
    if (cachedPath !== undefined) {
      if (cachedPath) {
        return cachedPath;
      }

      continue;
    }

    const currentPath = path.resolve(trimmedPath);
    const segments = currentPath.split(path.sep).filter(Boolean);

    for (let index = segments.length; index > 0; index -= 1) {
      const candidate = `${path.sep}${segments.slice(0, index).join(path.sep)}`;
      if (candidate.endsWith(".app") && (await pathExists(candidate))) {
        iconPathCache.set(trimmedPath, candidate);
        return candidate;
      }
    }

    if (await pathExists(currentPath)) {
      iconPathCache.set(trimmedPath, currentPath);
      return currentPath;
    }

    iconPathCache.set(trimmedPath, null);
  }

  return undefined;
}

export async function getRunningProcessGroups(): Promise<ProcessGroup[]> {
  const currentUser = os.userInfo().username;
  const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,rss=,user=,comm="], {
    maxBuffer: 1024 * 1024 * 8,
  });

  const processMap = new Map<string, ProcessEntry[]>();

  for (const line of stdout.split("\n")) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const match = trimmedLine.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const [, pidValue, rssValue, user, executablePath] = match;
    if (user !== currentUser) {
      continue;
    }

    const rssKb = Number(rssValue);
    const pid = Number(pidValue);
    const name = toProcessName(executablePath);

    if (!Number.isFinite(rssKb) || !Number.isFinite(pid) || !name) {
      continue;
    }

    const groupKey = name.toLowerCase();
    const currentGroup = processMap.get(groupKey) ?? [];
    currentGroup.push({
      pid,
      rssKb,
      executablePath,
      name,
    });
    processMap.set(groupKey, currentGroup);
  }

  return Array.from(processMap.entries())
    .map(([key, entries]) => {
      const totalRssKb = entries.reduce((sum, entry) => sum + entry.rssKb, 0);
      const executablePaths = Array.from(new Set(entries.map((entry) => entry.executablePath)));
      return {
        key,
        name: entries[0].name,
        totalRssKb,
        totalRssBytes: totalRssKb * 1024,
        processCount: entries.length,
        pids: entries.map((entry) => entry.pid).sort((left, right) => left - right),
        executablePaths,
      };
    })
    .sort((left, right) => right.totalRssBytes - left.totalRssBytes);
}

export async function resolveProcessGroupIcon(group: ProcessGroup): Promise<string | undefined> {
  if (group.iconPath) {
    return group.iconPath;
  }

  return resolveIconPath(group.executablePaths);
}

export async function terminateProcessGroup(group: ProcessGroup): Promise<{ terminatedCount: number; failedPids: number[] }> {
  const pids = Array.from(new Set(group.pids));
  const results = await Promise.allSettled(
    pids.map(async (pid) => {
      await execFileAsync("/bin/kill", ["-TERM", String(pid)]);
      return pid;
    }),
  );

  const failedPids = results.flatMap((result, index) => (result.status === "rejected" ? [pids[index]] : []));
  return {
    terminatedCount: pids.length - failedPids.length,
    failedPids,
  };
}
