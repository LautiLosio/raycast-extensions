import { LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";

const STORAGE_KEY = "scheduled-items";

export type ScheduleKind = "alarm" | "timer";

export type ScheduledItem = {
  id: string;
  kind: ScheduleKind;
  rawInput: string;
  displayValue: string;
  targetAt: string;
  createdAt: string;
  pid: number;
};

export async function getScheduledItems() {
  const rawValue = await LocalStorage.getItem<string>(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  const items = JSON.parse(rawValue) as ScheduledItem[];
  return items.sort(
    (left, right) =>
      new Date(left.targetAt).getTime() - new Date(right.targetAt).getTime(),
  );
}

export async function saveScheduledItems(items: ScheduledItem[]) {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function cleanupExpiredItems(now = new Date()) {
  const items = await getScheduledItems();
  const activeItems = items.filter(
    (item) => new Date(item.targetAt).getTime() > now.getTime(),
  );

  if (activeItems.length !== items.length) {
    await saveScheduledItems(activeItems);
  }

  return activeItems;
}

export async function addScheduledItem(
  item: Omit<ScheduledItem, "id" | "createdAt">,
) {
  const items = await cleanupExpiredItems();
  const newItem: ScheduledItem = {
    ...item,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  items.push(newItem);
  await saveScheduledItems(items);
  return newItem;
}

export async function removeScheduledItem(id: string) {
  const items = await getScheduledItems();
  const item = items.find((entry) => entry.id === id);

  if (!item) {
    return undefined;
  }

  await saveScheduledItems(items.filter((entry) => entry.id !== id));
  return item;
}

export async function replaceScheduledItem(
  id: string,
  item: Omit<ScheduledItem, "id" | "createdAt">,
) {
  const items = await cleanupExpiredItems();
  const nextItems = items.filter((entry) => entry.id !== id);
  const replacement: ScheduledItem = {
    ...item,
    id,
    createdAt: new Date().toISOString(),
  };

  nextItems.push(replacement);
  await saveScheduledItems(nextItems);
  return replacement;
}
