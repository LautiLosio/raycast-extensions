export type RuleMatchType = "exact" | "contains";
export type RuleMode = "ignore" | "threshold";

export interface ThresholdRule {
  id: string;
  pattern: string;
  matchType: RuleMatchType;
  mode: RuleMode;
  thresholdGb?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessEntry {
  pid: number;
  rssKb: number;
  executablePath: string;
  name: string;
}

export interface ProcessGroup {
  key: string;
  name: string;
  totalRssKb: number;
  totalRssBytes: number;
  processCount: number;
  pids: number[];
  executablePaths: string[];
}

export interface FlaggedProcessGroup extends ProcessGroup {
  thresholdBytes: number;
  thresholdGb: number;
  matchedRule?: ThresholdRule;
}

export interface ScanResult {
  scannedAt: string;
  defaultThresholdGb: number;
  cooldownMinutes: number;
  groups: ProcessGroup[];
  flagged: FlaggedProcessGroup[];
}

export interface NotificationState {
  [key: string]: string;
}
