import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Form,
  Icon,
  List,
  openCommandPreferences,
  showHUD,
} from "@raycast/api";
import { randomUUID } from "node:crypto";
import { useEffect, useMemo, useState } from "react";

import { getMonitorPreferences } from "./preferences";
import { formatBytes, getLastScanResult, scanMemoryUsage } from "./monitor";
import { getRules, saveRules } from "./storage";
import type { FlaggedProcessGroup, RuleMatchType, RuleMode, ScanResult, ThresholdRule } from "./types";

function formatRelativeTime(isoDate: string | undefined): string {
  if (!isoDate) {
    return "Never";
  }

  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const differenceMs = Date.now() - timestamp;
  const differenceMinutes = Math.floor(differenceMs / 60000);

  if (differenceMinutes < 1) {
    return "Just now";
  }

  if (differenceMinutes < 60) {
    return `${differenceMinutes}m ago`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);
  if (differenceHours < 24) {
    return `${differenceHours}h ago`;
  }

  const differenceDays = Math.floor(differenceHours / 24);
  return `${differenceDays}d ago`;
}

function ruleSubtitle(rule: ThresholdRule): string {
  if (rule.mode === "ignore") {
    return "Ignored during scans";
  }

  return `Custom threshold: ${rule.thresholdGb ?? "?"} GB`;
}

function sortRules(rules: ThresholdRule[]): ThresholdRule[] {
  return [...rules].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortFlagged(flagged: FlaggedProcessGroup[]): FlaggedProcessGroup[] {
  return [...flagged].sort((left, right) => right.totalRssBytes - left.totalRssBytes);
}

function RuleForm(props: {
  existingRule?: ThresholdRule;
  suggestedPattern?: string;
  initialMode?: RuleMode;
  onSave: (rule: ThresholdRule) => Promise<void>;
}) {
  const { existingRule, suggestedPattern, initialMode, onSave } = props;
  const preferences = getMonitorPreferences();
  const [patternError, setPatternError] = useState<string | undefined>();
  const [mode, setMode] = useState<RuleMode>(existingRule?.mode ?? initialMode ?? "threshold");

  return (
    <Form
      navigationTitle={existingRule ? "Edit Rule" : "New Rule"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={existingRule ? "Save Rule" : "Create Rule"}
            onSubmit={async (values: { pattern: string; matchType: RuleMatchType; mode: RuleMode; thresholdGb: string }) => {
              const pattern = values.pattern.trim();
              if (!pattern) {
                setPatternError("Enter a process name or fragment.");
                return;
              }

              const thresholdGb = Number(values.thresholdGb);
              if (values.mode === "threshold" && (!Number.isFinite(thresholdGb) || thresholdGb <= 0)) {
                setPatternError(undefined);
                throw new Error("Threshold must be a positive number.");
              }

              const now = new Date().toISOString();
              await onSave({
                id: existingRule?.id ?? randomUUID(),
                pattern,
                matchType: values.matchType,
                mode: values.mode,
                thresholdGb: values.mode === "threshold" ? thresholdGb : undefined,
                createdAt: existingRule?.createdAt ?? now,
                updatedAt: now,
              });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Create exact or partial matches for process names. Ignore rules silence alerts. Threshold rules replace the default 1 GB limit for matching processes." />
      <Form.TextField
        id="pattern"
        title="Process Pattern"
        placeholder="Google Chrome"
        defaultValue={existingRule?.pattern ?? suggestedPattern}
        error={patternError}
        onChange={() => setPatternError(undefined)}
      />
      <Form.Dropdown id="matchType" title="Match Type" defaultValue={existingRule?.matchType ?? "contains"}>
        <Form.Dropdown.Item value="contains" title="Name Contains" />
        <Form.Dropdown.Item value="exact" title="Exact Name" />
      </Form.Dropdown>
      <Form.Dropdown
        id="mode"
        title="Action"
        defaultValue={existingRule?.mode ?? initialMode ?? "threshold"}
        onChange={(value) => setMode(value as RuleMode)}
      >
        <Form.Dropdown.Item value="threshold" title="Custom Threshold" />
        <Form.Dropdown.Item value="ignore" title="Ignore Matches" />
      </Form.Dropdown>
      <Form.TextField
        id="thresholdGb"
        title="Threshold (GB)"
        placeholder={String(preferences.defaultThresholdGb)}
        info="Only used for Custom Threshold rules."
        defaultValue={existingRule?.thresholdGb ? String(existingRule.thresholdGb) : String(preferences.defaultThresholdGb)}
      />
      {mode === "ignore" ? <Form.Description text="This rule will suppress notifications for matching processes." /> : null}
    </Form>
  );
}

export default function Command() {
  const preferences = getMonitorPreferences();
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [rules, setRules] = useState<ThresholdRule[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | undefined>();

  async function loadState() {
    setIsLoading(true);
    try {
      const [storedRules, lastScan] = await Promise.all([getRules(), getLastScanResult()]);
      setRules(sortRules(storedRules));
      setScanResult(lastScan);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, []);

  const topGroups = useMemo(() => scanResult?.groups.slice(0, 12) ?? [], [scanResult]);
  const flaggedGroups = useMemo(() => sortFlagged(scanResult?.flagged ?? []), [scanResult]);

  async function persistRules(nextRules: ThresholdRule[]) {
    await saveRules(nextRules);
    setRules(sortRules(nextRules));
  }

  async function handleScanNow() {
    setIsScanning(true);
    try {
      const { result, notifiedGroups } = await scanMemoryUsage({ notify: true, updateMetadata: false });
      setScanResult(result);
      const baseMessage =
        result.flagged.length > 0
          ? `${result.flagged.length} process${result.flagged.length === 1 ? "" : "es"} above their limit`
          : "No processes above their limit";
      const notificationSuffix =
        notifiedGroups.length > 0
          ? ` - notified for ${notifiedGroups.length} process${notifiedGroups.length === 1 ? "" : "es"}`
          : "";
      await showHUD(`${baseMessage}${notificationSuffix}`);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSaveRule(rule: ThresholdRule) {
    const existingIndex = rules.findIndex((candidate) => candidate.id === rule.id);
    const nextRules =
      existingIndex >= 0
        ? rules.map((candidate) => (candidate.id === rule.id ? rule : candidate))
        : [rule, ...rules];

    await persistRules(nextRules);
    await showHUD(existingIndex >= 0 ? "Rule updated" : "Rule created");
  }

  async function handleDeleteRule(ruleId: string) {
    const confirmed = await confirmAlert({
      title: "Delete Rule",
      message: "This removes the custom threshold or ignore rule for that process pattern.",
      primaryAction: {
        title: "Delete Rule",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    const nextRules = rules.filter((rule) => rule.id !== ruleId);
    await persistRules(nextRules);
    await showHUD("Rule deleted");
  }

  const commonActions = (
    <ActionPanel.Section>
      <Action title="Run Scan Now" icon={Icon.ArrowClockwise} onAction={handleScanNow} />
      <Action.Push
        title="Add Threshold Rule"
        icon={Icon.PlusCircle}
        target={<RuleForm onSave={handleSaveRule} />}
      />
      <Action.Push
        title="Add Ignore Rule"
        icon={Icon.EyeDisabled}
        target={<RuleForm onSave={handleSaveRule} initialMode="ignore" />}
      />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
    </ActionPanel.Section>
  );

  return (
    <List
      isLoading={isLoading || isScanning}
      searchBarPlaceholder="Filter processes and rules"
      isShowingDetail={false}
      actions={
        <ActionPanel>
          {commonActions}
        </ActionPanel>
      }
    >
      <List.Section title="Overview">
        <List.Item
          title="Memory Monitor"
          subtitle={`Default threshold: ${preferences.defaultThresholdGb} GB`}
          icon={{ source: Icon.MemoryChip, tintColor: Color.Blue }}
          accessories={[
            { text: `${preferences.notificationCooldownMinutes}m cooldown` },
            { tag: scanResult ? formatRelativeTime(scanResult.scannedAt) : "Never scanned" },
          ]}
          actions={
            <ActionPanel>
              {commonActions}
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title={`Processes Over Threshold (${flaggedGroups.length})`}>
        {flaggedGroups.length > 0 ? (
          flaggedGroups.map((group) => (
            <List.Item
              key={group.key}
              title={group.name}
              subtitle={group.matchedRule ? `Rule: ${group.matchedRule.pattern}` : "Using default threshold"}
              icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
              accessories={[
                { text: `${group.processCount} proc` },
                { text: `${formatBytes(group.totalRssBytes)} / ${group.thresholdGb.toFixed(2)} GB` },
              ]}
              actions={
                <ActionPanel>
                  <Action title="Run Scan Now" icon={Icon.ArrowClockwise} onAction={handleScanNow} />
                  <Action.Push
                    title="Ignore This Process"
                    icon={Icon.EyeDisabled}
                    target={<RuleForm suggestedPattern={group.name} onSave={handleSaveRule} initialMode="ignore" />}
                  />
                  <Action.Push
                    title="Set Custom Threshold"
                    icon={Icon.Gauge}
                    target={<RuleForm suggestedPattern={group.name} onSave={handleSaveRule} />}
                  />
                  <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
                </ActionPanel>
              }
            />
          ))
        ) : (
          <List.Item
            title="Nothing above the configured limits"
            subtitle="Run a scan to refresh the list"
            icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
            actions={
              <ActionPanel>
                {commonActions}
              </ActionPanel>
            }
          />
        )}
      </List.Section>

      <List.Section title="Top Memory Usage">
        {topGroups.map((group) => (
          <List.Item
            key={`top-${group.key}`}
            title={group.name}
            subtitle={`${group.processCount} process${group.processCount === 1 ? "" : "es"}`}
            icon={Icon.AppWindowGrid3x3}
            accessories={[{ text: formatBytes(group.totalRssBytes) }]}
            actions={
              <ActionPanel>
                <Action title="Run Scan Now" icon={Icon.ArrowClockwise} onAction={handleScanNow} />
                <Action.Push
                  title="Ignore This Process"
                  icon={Icon.EyeDisabled}
                  target={<RuleForm suggestedPattern={group.name} onSave={handleSaveRule} initialMode="ignore" />}
                />
                <Action.Push
                  title="Set Custom Threshold"
                  icon={Icon.Gauge}
                  target={<RuleForm suggestedPattern={group.name} onSave={handleSaveRule} />}
                />
                <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title={`Rules (${rules.length})`}>
        {rules.length > 0 ? (
          rules.map((rule) => (
            <List.Item
              key={rule.id}
              title={rule.pattern}
              subtitle={ruleSubtitle(rule)}
              icon={
                rule.mode === "ignore"
                  ? { source: Icon.EyeDisabled, tintColor: Color.SecondaryText }
                  : { source: Icon.Gauge, tintColor: Color.Orange }
              }
              accessories={[
                { text: rule.matchType === "exact" ? "Exact" : "Contains" },
                { tag: rule.mode === "ignore" ? "Ignored" : `${rule.thresholdGb} GB` },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push title="Edit Rule" icon={Icon.Pencil} target={<RuleForm existingRule={rule} onSave={handleSaveRule} />} />
                  <Action title="Delete Rule" icon={Icon.Trash} style={Action.Style.Destructive} onAction={() => handleDeleteRule(rule.id)} />
                  <Action title="Run Scan Now" icon={Icon.ArrowClockwise} onAction={handleScanNow} />
                  <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
                </ActionPanel>
              }
            />
          ))
        ) : (
          <List.Item
            title="No custom rules yet"
            subtitle="Create ignore rules or per-program thresholds"
            icon={Icon.PlusCircle}
            actions={
              <ActionPanel>
                {commonActions}
              </ActionPanel>
            }
          />
        )}
      </List.Section>
    </List>
  );
}
