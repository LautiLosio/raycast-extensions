import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Form,
  Icon,
  launchCommand,
  LaunchType,
  List,
  openCommandPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { randomUUID } from "node:crypto";
import { useEffect, useMemo, useState } from "react";

import { getMonitorPreferences } from "./preferences";
import { formatBytes, getLastScanResult, scanMemoryUsage, sendTestNotification } from "./monitor";
import { terminateProcessGroup } from "./processes";
import { getRules, getSetupState, patchSetupState, saveRules } from "./storage";
import type { FlaggedProcessGroup, ProcessGroup, RuleMatchType, RuleMode, ScanResult, SetupState, ThresholdRule } from "./types";

const BACKGROUND_SCAN_INTERVAL_MINUTES = 5;
const BACKGROUND_SCAN_STALE_MS = 20 * 60 * 1000;

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

function isOlderThan(isoDate: string | undefined, maxAgeMs: number): boolean {
  if (!isoDate) {
    return false;
  }

  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp > maxAgeMs;
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

function processIcon(group: ProcessGroup) {
  return group.iconPath ? { fileIcon: group.iconPath } : Icon.AppWindowGrid3x3;
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
      <Form.Description text="Create exact or partial matches for process names. Ignore rules silence alerts. Threshold rules replace the default limit for matching processes." />
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
  const [setupState, setSetupState] = useState<SetupState>({});

  async function loadState() {
    setIsLoading(true);
    try {
      const [storedRules, lastScan, storedSetupState] = await Promise.all([getRules(), getLastScanResult(), getSetupState()]);
      setRules(sortRules(storedRules));
      setScanResult(lastScan);
      setSetupState(storedSetupState);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, []);

  const topGroups = useMemo(() => scanResult?.groups.slice(0, 12) ?? [], [scanResult]);
  const flaggedGroups = useMemo(() => sortFlagged(scanResult?.flagged ?? []), [scanResult]);
  const backgroundMonitoringEnabled = Boolean(setupState.lastScheduledCommandRunAt);
  const automaticBackgroundSeen = Boolean(setupState.lastBackgroundRefreshAt);
  const backgroundScanLooksStale = isOlderThan(setupState.lastBackgroundRefreshAt, BACKGROUND_SCAN_STALE_MS);
  const notificationsVerified = Boolean(setupState.lastNotificationTestAt);
  const setupComplete = backgroundMonitoringEnabled && notificationsVerified;

  async function persistRules(nextRules: ThresholdRule[]) {
    await saveRules(nextRules);
    setRules(sortRules(nextRules));
  }

  async function handleScanNow() {
    setIsScanning(true);
    try {
      const { result, notifiedGroups } = await scanMemoryUsage({ notify: true, updateMetadata: false });
      setScanResult(result);
      setSetupState(await patchSetupState({ lastDashboardScanAt: result.scannedAt }));
      const baseMessage =
        result.flagged.length > 0
          ? `${result.flagged.length} process${result.flagged.length === 1 ? "" : "es"} above their limit`
          : "No processes above their limit";
      const notificationSuffix =
        notifiedGroups.length > 0
          ? ` - notified for ${notifiedGroups.length} process${notifiedGroups.length === 1 ? "" : "es"}`
          : "";
      await showToast({
        style: result.flagged.length > 0 ? Toast.Style.Failure : Toast.Style.Success,
        title: baseMessage,
        message: notificationSuffix ? notificationSuffix.slice(3) : undefined,
      });
    } finally {
      setIsScanning(false);
    }
  }

  async function handleEnableBackgroundMonitoring() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Starting scheduled scan",
      message: "This enables Raycast's recurring background scan",
    });

    try {
      await launchCommand({ name: "background-memory-scan", type: LaunchType.UserInitiated });
      const now = new Date().toISOString();
      setSetupState(await patchSetupState({ lastScheduledCommandRunAt: now }));
      toast.style = Toast.Style.Success;
      toast.title = "Background scans enabled";
      toast.message = `Raycast should now run the scan about every ${BACKGROUND_SCAN_INTERVAL_MINUTES} minutes`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Couldn't start the scheduled scan";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  async function handleSendTestNotification() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Sending test notification",
      message: "This uses the same macOS notification path as real alerts",
    });

    try {
      await sendTestNotification();
      const confirmed = await confirmAlert({
      title: "Did the test alert appear?",
      message: "If not, enable Raycast notifications in macOS System Settings and try again.",
        primaryAction: {
          title: "Yes, I Saw It",
        },
        dismissAction: {
          title: "Not Yet",
        },
      });

      if (!confirmed) {
        toast.style = Toast.Style.Failure;
        toast.title = "Notification not confirmed";
        toast.message = "Enable Raycast notifications, then try again";
        return;
      }

      const now = new Date().toISOString();
      setSetupState(await patchSetupState({ lastNotificationTestAt: now }));
      toast.style = Toast.Style.Success;
      toast.title = "Notifications verified";
      toast.message = "Future alerts will use the same macOS channel";
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Couldn't send test notification";
      toast.message = error instanceof Error ? error.message : "Unknown error";
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

  async function handleTerminateProcessGroup(group: ProcessGroup) {
    const confirmed = await confirmAlert({
      title: group.processCount === 1 ? `Quit ${group.name}?` : `Quit ${group.name} processes?`,
      message:
        group.processCount === 1
          ? `This will send SIGTERM to PID ${group.pids[0]}.`
          : `This will send SIGTERM to ${group.processCount} processes (${group.pids.join(", ")}).`,
      primaryAction: {
        title: group.processCount === 1 ? "Quit Process" : "Quit Processes",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    const { terminatedCount, failedPids } = await terminateProcessGroup(group);

    if (terminatedCount === 0) {
      throw new Error(
        failedPids.length > 0 ? `Unable to quit ${group.name} (${failedPids.join(", ")})` : `Unable to quit ${group.name}`,
      );
    }

    await loadState();

    const suffix = failedPids.length > 0 ? `, ${failedPids.length} failed` : "";
    await showHUD(
      terminatedCount === 1 ? `Quit 1 ${group.name} process${suffix}` : `Quit ${terminatedCount} ${group.name} processes${suffix}`,
    );
  }

  function processActions(group: ProcessGroup) {
    return (
      <ActionPanel>
        <Action
          title={group.processCount === 1 ? "Kill Process" : "Kill Processes"}
          icon={Icon.Stop}
          style={Action.Style.Destructive}
          onAction={() => handleTerminateProcessGroup(group)}
        />
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
    );
  }

  const commonActions = (
    <ActionPanel.Section>
      <Action title="Run Scan Now" icon={Icon.ArrowClockwise} onAction={handleScanNow} />
      <Action
        title={backgroundMonitoringEnabled ? "Run Scheduled Scan Again" : "Enable Background Monitoring"}
        icon={Icon.Play}
        onAction={handleEnableBackgroundMonitoring}
      />
      <Action
        title={notificationsVerified ? "Send Another Test Notification" : "Verify Notifications"}
        icon={Icon.Bell}
        onAction={handleSendTestNotification}
      />
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
      {!setupComplete ? (
        <List.Section title="Setup Checklist">
          <List.Item
            title={
              !backgroundMonitoringEnabled
                ? "Enable Background Monitoring"
                : !automaticBackgroundSeen
                  ? "Waiting for First Automatic Scan"
                  : backgroundScanLooksStale
                    ? "Automatic Scans Look Stale"
                    : "Automatic Background Scans Active"
            }
            subtitle={
              !backgroundMonitoringEnabled
                ? "Run the scheduled command once to enable Raycast's 5-minute background scan."
                : !automaticBackgroundSeen
                  ? "Background scans are enabled. The first automatic run should happen soon."
                  : backgroundScanLooksStale
                    ? "No automatic background scan has been seen recently. Re-run setup if alerts stop."
                    : "Raycast is running scans automatically."
            }
            icon={{
              source: !backgroundMonitoringEnabled
                ? Icon.Play
                : !automaticBackgroundSeen || backgroundScanLooksStale
                  ? Icon.ExclamationMark
                  : Icon.CheckCircle,
              tintColor: !backgroundMonitoringEnabled
                ? Color.Orange
                : !automaticBackgroundSeen || backgroundScanLooksStale
                  ? Color.Yellow
                  : Color.Green,
            }}
            accessories={[
              { text: `Every ${BACKGROUND_SCAN_INTERVAL_MINUTES}m` },
              {
                tag: automaticBackgroundSeen
                  ? `Auto ${formatRelativeTime(setupState.lastBackgroundRefreshAt)}`
                  : backgroundMonitoringEnabled
                    ? `Armed ${formatRelativeTime(setupState.lastScheduledCommandRunAt)}`
                    : "Not armed",
              },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title={backgroundMonitoringEnabled ? "Run Scheduled Scan Again" : "Enable Background Monitoring"}
                  icon={Icon.Play}
                  onAction={handleEnableBackgroundMonitoring}
                />
                {commonActions}
              </ActionPanel>
            }
          />

          <List.Item
            title={notificationsVerified ? "Notifications Verified" : "Verify Notifications"}
            subtitle={
              notificationsVerified
                ? "A test alert was confirmed. Future alerts use the same macOS notification path."
                : "Send a test alert and confirm it appears."
            }
            icon={{
              source: notificationsVerified ? Icon.CheckCircle : Icon.Bell,
              tintColor: notificationsVerified ? Color.Green : Color.Orange,
            }}
            accessories={[
              {
                tag: notificationsVerified ? formatRelativeTime(setupState.lastNotificationTestAt) : "Needs test",
              },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title={notificationsVerified ? "Send Another Test Notification" : "Verify Notifications"}
                  icon={Icon.Bell}
                  onAction={handleSendTestNotification}
                />
                {commonActions}
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      <List.Section title="Overview">
        <List.Item
          title="Memory Sentinel"
          subtitle={`Default threshold: ${preferences.defaultThresholdGb} GB`}
          icon={{ source: Icon.MemoryChip, tintColor: Color.Blue }}
          accessories={[
            { text: `${preferences.notificationCooldownMinutes}m cooldown` },
            {
              text: automaticBackgroundSeen
                ? `Auto ${formatRelativeTime(setupState.lastBackgroundRefreshAt)}`
                : backgroundMonitoringEnabled
                  ? "Awaiting first auto scan"
                  : "Setup required",
            },
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
              icon={processIcon(group)}
              accessories={[
                { icon: { source: Icon.ExclamationMark, tintColor: Color.Red } },
                { text: `${group.processCount} proc` },
                { text: `${formatBytes(group.totalRssBytes)} / ${group.thresholdGb.toFixed(2)} GB` },
              ]}
              actions={processActions(group)}
            />
          ))
        ) : (
          <List.Item
            title="Nothing above the configured limits"
            subtitle="Run a scan to refresh"
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
            icon={processIcon(group)}
            accessories={[{ text: formatBytes(group.totalRssBytes) }]}
            actions={processActions(group)}
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
            subtitle="Create ignore rules or custom thresholds"
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
