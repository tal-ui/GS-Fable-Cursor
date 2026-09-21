"use client";

import * as React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Button that asks for confirmation before running a destructive or irreversible action. */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  children,
  variant = "outline",
  size = "sm",
  pending,
  disabled,
  destructive,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => unknown;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  pending?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled || pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { void onConfirm(); }} className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
