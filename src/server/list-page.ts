import "server-only";
import type { CurrentUser } from "@/lib/auth/session";
import { listSavedFilters } from "./saved-filters";
import { parseListParams, type ListParams } from "./list";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Shared bootstrap for every list page: parse URL params and load the user's saved views. */
export async function loadListPage(user: CurrentUser, entity: string, searchParams: SearchParams, defaults?: Partial<ListParams>) {
  const raw = await searchParams;
  const params = parseListParams(raw, defaults);
  const saved = await listSavedFilters(user.id, entity);
  return {
    raw,
    params,
    savedFilters: saved.map((s) => ({ id: s.id, name: s.name, filters: s.filters, isDefault: s.isDefault })),
    openNew: raw.new === "1",
  };
}
