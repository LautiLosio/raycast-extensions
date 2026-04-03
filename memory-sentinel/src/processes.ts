import { promisify } from "node:util";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";

import type { ProcessEntry, ProcessGroup } from "./types";

const execFileAsync = promisify(execFile);

function toProcessName(executablePath: string): string {
  const baseName = path.basename(executablePath.trim());
  return baseName || executablePath.trim();
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
      return {
        key,
        name: entries[0].name,
        totalRssKb,
        totalRssBytes: totalRssKb * 1024,
        processCount: entries.length,
        pids: entries.map((entry) => entry.pid).sort((left, right) => left - right),
        executablePaths: Array.from(new Set(entries.map((entry) => entry.executablePath))),
      };
    })
    .sort((left, right) => right.totalRssBytes - left.totalRssBytes);
}
