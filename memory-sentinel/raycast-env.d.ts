/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Default Threshold (GB) - Alert when a process exceeds this limit unless a rule overrides it. */
  "defaultThresholdGb": string,
  /** Notification Cooldown (Minutes) - Minimum time before alerting again for the same process. */
  "notificationCooldownMinutes": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `memory-monitor-dashboard` command */
  export type MemoryMonitorDashboard = ExtensionPreferences & {}
  /** Preferences accessible in the `background-memory-scan` command */
  export type BackgroundMemoryScan = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `memory-monitor-dashboard` command */
  export type MemoryMonitorDashboard = {}
  /** Arguments passed to the `background-memory-scan` command */
  export type BackgroundMemoryScan = {}
}

