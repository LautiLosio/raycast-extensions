# Memory Sentinel

Raycast extension for macOS that scans running processes, alerts when they cross a memory threshold, and lets you set simple per-app rules.

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

## First-time setup

Open `Open Memory Sentinel` and complete the setup checklist:

- `Enable Background Monitoring`: runs the scheduled `Run Memory Scan` command once so Raycast starts the recurring background scan.
- `Verify Notifications`: sends a test macOS alert and asks you to confirm that it appeared.

After setup, the dashboard shows whether:

- the scheduled scan is enabled
- Raycast has actually performed an automatic background run
- alerts were verified successfully

If automatic background scans stop appearing, the dashboard warns that setup may need attention.

## Development

```bash
npm install
npm run build
```
