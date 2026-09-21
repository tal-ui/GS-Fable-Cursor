"use client";

import * as React from "react";
import type { Viewer } from "@/lib/viewer";

const ViewerContext = React.createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const v = React.useContext(ViewerContext);
  if (!v) throw new Error("useViewer must be used inside ViewerProvider");
  return v;
}

/** Convenience: hides children entirely unless the viewer holds the permission. UI-level only; the API re-checks. */
export function Can({ permission, children, fallback = null }: { permission: keyof Viewer["permissions"]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const viewer = useViewer();
  return <>{viewer.permissions[permission] ? children : fallback}</>;
}
