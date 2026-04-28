import { showFailureToast, showToast, Toast } from "@raycast/api";
import { parseDuration, parseTimeOfDay } from "./parsing";
import {
  addScheduledItem,
  removeScheduledItem,
  replaceScheduledItem,
  ScheduleKind,
  ScheduledItem,
} from "./schedules";
import { scheduleNotification } from "./scheduler";

type ScheduleResult = {
  confirmation: string;
  item: Omit<ScheduledItem, "id" | "createdAt">;
};

export async function createSchedule(
  kind: ScheduleKind,
  rawInput: string,
): Promise<ScheduleResult> {
  if (kind === "alarm") {
    const { delaySeconds, normalizedTime, targetDate, rollsToTomorrow } =
      parseTimeOfDay(rawInput);
    const pid = await scheduleNotification({
      delaySeconds,
      title: "Alarm",
      message: `Alarm for ${normalizedTime} is ringing.`,
    });

    return {
      confirmation: `Alarm set for ${normalizedTime} ${rollsToTomorrow ? "tomorrow" : "today"}`,
      item: {
        kind,
        rawInput,
        displayValue: normalizedTime,
        targetAt: targetDate.toISOString(),
        pid,
      },
    };
  }

  const { totalSeconds, normalizedDuration } = parseDuration(rawInput);
  const targetDate = new Date(Date.now() + totalSeconds * 1000);
  const pid = await scheduleNotification({
    delaySeconds: totalSeconds,
    title: "Timer",
    message: `Your ${normalizedDuration} timer is done.`,
  });

  return {
    confirmation: `Timer started for ${normalizedDuration}`,
    item: {
      kind,
      rawInput,
      displayValue: normalizedDuration,
      targetAt: targetDate.toISOString(),
      pid,
    },
  };
}

export async function createAndPersistSchedule(
  kind: ScheduleKind,
  rawInput: string,
) {
  const result = await createSchedule(kind, rawInput);
  await addScheduledItem(result.item);
  return result.confirmation;
}

export async function deleteScheduledItem(item: ScheduledItem) {
  stopScheduledProcess(item.pid);
  await removeScheduledItem(item.id);
}

export async function editScheduledItem(item: ScheduledItem, rawInput: string) {
  stopScheduledProcess(item.pid);
  const result = await createSchedule(item.kind, rawInput);
  await replaceScheduledItem(item.id, result.item);
  return result.confirmation;
}

export async function deleteScheduledItemWithToast(item: ScheduledItem) {
  try {
    await deleteScheduledItem(item);
    await showToast({
      style: Toast.Style.Success,
      title: `${capitalize(item.kind)} deleted`,
    });
  } catch (error) {
    await showFailureToast(error, {
      title: `Couldn't delete ${item.kind}`,
    });
  }
}

function stopScheduledProcess(pid: number) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The process may have already finished.
  }
}

function capitalize(value: string) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
