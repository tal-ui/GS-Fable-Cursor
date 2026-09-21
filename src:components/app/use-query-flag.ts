"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Boolean UI state mirrored in a URL query flag (e.g. `?new=1`) so quick actions elsewhere
 * in the app can deep-link into a slide-over. Clearing the flag rewrites the URL without a reload.
 */
export function useQueryFlag(key: string, initial = false): [boolean, (open: boolean) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(initial || searchParams.get(key) === "1");

  const set = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && searchParams.get(key) === "1") {
        const params = new URLSearchParams(searchParams.toString());
        params.delete(key);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [key, pathname, router, searchParams],
  );

  return [open, set];
}
