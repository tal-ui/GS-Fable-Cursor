"use client";

import * as React from "react";

/** Snapshot of the clock taken once per mount, so render stays pure while "overdue" checks still work. */
export function useNow(): number {
  const [now] = React.useState(() => Date.now());
  return now;
}
