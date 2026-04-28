import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showFailureToast,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { editScheduledItem, deleteScheduledItemWithToast } from "./lib/manage";
import { cleanupExpiredItems, ScheduledItem } from "./lib/schedules";

export default function ManageSchedulesCommand() {
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  async function loadItems() {
    setIsLoading(true);

    try {
      const nextItems = await cleanupExpiredItems();
      setItems(nextItems);
    } catch (error) {
      await showFailureToast(error, { title: "Couldn't load schedules" });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search alarms and timers">
      <List.EmptyView
        icon={Icon.Alarm}
        title="No scheduled alarms or timers"
        description="Use Set Alarm or Start Timer from Raycast root search."
      />
      {items.map((item) => (
        <List.Item
          key={item.id}
          icon={item.kind === "alarm" ? Icon.Alarm : Icon.Hourglass}
          title={
            item.kind === "alarm"
              ? `Alarm at ${item.displayValue}`
              : `Timer for ${item.displayValue}`
          }
          subtitle={formatTarget(item.targetAt)}
          accessories={[
            { text: formatRemaining(item.targetAt, now) },
            { text: item.kind.toUpperCase() },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title={`Edit ${capitalize(item.kind)}`}
                icon={Icon.Pencil}
                target={<EditScheduleForm item={item} onSaved={loadItems} />}
              />
              <Action
                title={`Delete ${capitalize(item.kind)}`}
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={async () => {
                  await deleteScheduledItemWithToast(item);
                  await loadItems();
                }}
              />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                onAction={loadItems}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function EditScheduleForm(props: {
  item: ScheduledItem;
  onSaved: () => Promise<void>;
}) {
  const { item, onSaved } = props;

  return (
    <Form
      navigationTitle={`Edit ${capitalize(item.kind)}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={`Save ${capitalize(item.kind)}`}
            onSubmit={async (values: { value: string }) => {
              try {
                const confirmation = await editScheduledItem(
                  item,
                  values.value,
                );
                await showToast({
                  style: Toast.Style.Success,
                  title: confirmation,
                });
                await onSaved();
              } catch (error) {
                await showFailureToast(error, {
                  title: `Couldn't edit ${item.kind}`,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Current"
        text={`${item.kind === "alarm" ? "Alarm" : "Timer"}: ${item.rawInput}`}
      />
      <Form.TextField
        id="value"
        title={item.kind === "alarm" ? "Time" : "Duration"}
        defaultValue={item.rawInput}
        info={
          item.kind === "alarm"
            ? "Examples: 7:30 am, 19:30, 0730"
            : "Examples: 10m, 90s, 1h 30m"
        }
      />
    </Form>
  );
}

function formatTarget(targetAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(targetAt));
}

function formatRemaining(targetAt: string, now: number) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(targetAt).getTime() - now) / 1000),
  );

  if (remainingSeconds < 60) {
    return `${remainingSeconds}s left`;
  }

  const totalMinutes = Math.ceil(remainingSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return `${parts.join(" ")} left`;
}

function capitalize(value: string) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
