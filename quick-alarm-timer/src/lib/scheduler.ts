import { spawn } from "node:child_process";

function quoteForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function scheduleNotification(options: {
  delaySeconds: number;
  title: string;
  message: string;
}) {
  const { delaySeconds, title, message } = options;
  const soundFile = "/System/Library/Sounds/Hero.aiff";

  const script = [
    `sleep ${Math.max(1, Math.floor(delaySeconds))}`,
    `(`,
    `  for _ in $(seq 1 12); do`,
    `    afplay ${quoteForShell(soundFile)}`,
    `    sleep 0.15`,
    `  done`,
    `) &`,
    `sound_pid=$!`,
    `osascript <<'APPLESCRIPT'`,
    `display notification "${quoteForAppleScript(message)}" with title "${quoteForAppleScript(title)}"`,
    `display dialog "${quoteForAppleScript(message)}" with title "${quoteForAppleScript(title)}" buttons {"Dismiss"} default button "Dismiss" giving up after 60 with icon caution`,
    `APPLESCRIPT`,
    `kill "$sound_pid" >/dev/null 2>&1 || true`,
  ].join("\n");

  const child = spawn("sh", ["-c", script], {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
  return child.pid ?? 0;
}
