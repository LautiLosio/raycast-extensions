import { LaunchType, environment, showHUD } from "@raycast/api";

import { scanMemoryUsage } from "./monitor";
import { patchSetupState } from "./storage";

export default async function Command() {
  const { result, notifiedGroups } = await scanMemoryUsage({ notify: true, updateMetadata: true });
  await patchSetupState({
    lastScheduledCommandRunAt: result.scannedAt,
    ...(environment.launchType === LaunchType.Background ? { lastBackgroundRefreshAt: result.scannedAt } : {}),
  });

  if (environment.launchType === LaunchType.UserInitiated) {
    const message =
      result.flagged.length > 0
        ? `${result.flagged.length} process${result.flagged.length === 1 ? "" : "es"} above their limit`
        : "No processes above their limit";
    const notificationSuffix =
      notifiedGroups.length > 0
        ? ` - notified for ${notifiedGroups.length} process${notifiedGroups.length === 1 ? "" : "es"}`
        : "";

    await showHUD(`${message}${notificationSuffix}`);
  }
}
