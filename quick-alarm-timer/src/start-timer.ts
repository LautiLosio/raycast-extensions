import { closeMainWindow, LaunchProps, showHUD } from "@raycast/api";
import { createAndPersistSchedule } from "./lib/manage";

type TimerArguments = {
  duration: string;
};

export default async function command(
  props: LaunchProps<{ arguments: TimerArguments }>,
) {
  const confirmation = await createAndPersistSchedule(
    "timer",
    props.arguments.duration,
  );
  await closeMainWindow({ clearRootSearch: true });
  await showHUD(confirmation);
}
