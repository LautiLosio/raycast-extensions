# Memory Sentinel

Raycast extension for macOS that scans running processes, alerts when one crosses a memory threshold, and lets you create custom per-program rules.

## What it does

- Uses a default threshold of `1 GB`.
- Runs a background `no-view` scan every `5 minutes`.
- Sends a macOS notification when a process group exceeds its configured limit.
- Lets you create rule-based overrides:
  - ignore a process entirely
  - assign a custom threshold for a process name
- Prevents notification spam with a configurable cooldown.

## How rules work

Rules are stored locally in Raycast `LocalStorage`.

Each rule has:

- a process name pattern
- a match mode: `Exact Name` or `Name Contains`
- an action: `Ignore` or `Custom Threshold`

The most specific matching rule wins. Exact matches beat partial matches, and longer patterns beat shorter ones.

## Preferences

- `Default Threshold (GB)`: global limit for every process without a custom rule
- `Notification Cooldown (Minutes)`: minimum wait before alerting again for the same process group

## Development

```bash
npm install
npm run build
```
