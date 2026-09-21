import { z } from "zod";

export const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(200).default(25),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(200).optional(),
  filters: z.record(z.string(), z.string()).default({}),
});

export type ListParams = z.output<typeof listParamsSchema>;

export type ListResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/** Parses list parameters from a URL search-params-like record. Filter keys are prefixed with `f_`. */
export function parseListParams(raw: Record<string, string | string[] | undefined>, defaults?: Partial<ListParams>): ListParams {
  const filters: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("f_") && typeof v === "string" && v !== "") filters[k.slice(2)] = v;
  }
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return listParamsSchema.parse({
    page: first(raw.page) ?? defaults?.page,
    pageSize: first(raw.pageSize) ?? defaults?.pageSize,
    sort: first(raw.sort) ?? defaults?.sort,
    dir: first(raw.dir) ?? defaults?.dir,
    q: first(raw.q) ?? defaults?.q,
    filters,
  });
}

export function paginate<T>(rows: T[], total: number, params: ListParams): ListResult<T> {
  return { rows, total, page: params.page, pageSize: params.pageSize, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) };
}
