"use client";

import * as React from "react";
import { cn } from "cn";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Slide-over panel used for every create/edit form so the user keeps their context.
 * `footer` is pinned to the bottom; the body scrolls.
 */
export function SlideOver({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 p-0", width)}>
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">Form</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <SheetFooter className="flex-row justify-end gap-2 border-t bg-muted/30 px-6 py-3">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
