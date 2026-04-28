import { closeMainWindow, LaunchProps, showHUD } from "@raycast/api";
import { createAndPersistSchedule } from "./lib/manage";

type AlarmArguments = {
  time: string;
};

export default async function command(
  props: LaunchProps<{ arguments: AlarmArguments }>,
) {
  const confirmation = await createAndPersistSchedule(
    "alarm",
    props.arguments.time,
  );
  await closeMainWindow({ clearRootSearch: true });
  await showHUD(confirmation);
}
