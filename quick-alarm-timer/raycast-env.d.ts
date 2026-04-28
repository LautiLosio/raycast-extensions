/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `set-alarm` command */
  export type SetAlarm = ExtensionPreferences & {}
  /** Preferences accessible in the `start-timer` command */
  export type StartTimer = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-schedules` command */
  export type ManageSchedules = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `set-alarm` command */
  export type SetAlarm = {
  /** 7:30 am or 19:30 */
  "time": string
}
  /** Arguments passed to the `start-timer` command */
  export type StartTimer = {
  /** 10m, 90s, 1h 30m */
  "duration": string
}
  /** Arguments passed to the `manage-schedules` command */
  export type ManageSchedules = {}
}

