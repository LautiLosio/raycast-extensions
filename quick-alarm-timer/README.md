# Quick Alarm Timer

Two Raycast commands that let you create an alarm or timer directly from Raycast root search.

## Commands

### Set Alarm

Type a time of day directly in Raycast, for example:

- `7:30 am`
- `19:30`
- `0730`

If the time already passed today, the alarm is scheduled for tomorrow.

### Start Timer

Type a duration directly in Raycast, for example:

- `10m`
- `90s`
- `1h 30m`
- `2 hours 15 minutes`

## How it works

Each command spawns a detached macOS background process that waits and then fires a native notification plus a system beep. This keeps the implementation simple and makes both commands available straight from the main Raycast search bar.

## Development

```bash
npm install
npm run dev
```
