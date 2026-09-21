"use client";

import * as React from "react";
import { Controller, FormProvider, useForm, useFormContext, useWatch, type DefaultValues, type FieldPath, type FieldPathValue, type FieldValues, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type FormIn<S extends z.ZodType> = z.input<S> & FieldValues;
export type ZodForm<S extends z.ZodType> = UseFormReturn<FormIn<S>>;

/**
 * react-hook-form + zod. Validation runs against the schema in the browser for instant feedback,
 * but the *raw* input values are handed to submit so the server action (which re-validates with the
 * same schema) receives exactly the shape it is typed for.
 */
export function useZodForm<S extends z.ZodType>(schema: S, defaultValues?: DefaultValues<FormIn<S>>): ZodForm<S> {
  return useForm<FormIn<S>>({
    resolver: zodResolver(schema as never, undefined, { raw: true }) as never,
    defaultValues,
    mode: "onBlur",
    reValidateMode: "onChange",
  });
}

/**
 * Read one field's live value during render. form.watch() subscribes synchronously while rendering, so a
 * Controller that mounts later (e.g. a conditionally shown switch) registers itself mid-render and
 * triggers a parent setState from inside a child render. useWatch subscribes in an effect instead.
 */
export function useFieldValue<TIn extends FieldValues, TName extends FieldPath<TIn>>(form: UseFormReturn<TIn>, name: TName): FieldPathValue<TIn, TName> {
  return useWatch({ control: form.control, name });
}

export function Form<TIn extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  fieldErrors,
}: {
  form: UseFormReturn<TIn>;
  onSubmit: (values: TIn) => unknown;
  children: React.ReactNode;
  className?: string;
  fieldErrors?: Record<string, string>;
}) {
  React.useEffect(() => {
    if (!fieldErrors) return;
    for (const [key, message] of Object.entries(fieldErrors)) {
      if (key === "_") continue;
      form.setError(key as FieldPath<TIn>, { type: "server", message });
    }
  }, [fieldErrors, form]);
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((values) => void onSubmit(values))} className={cn("flex flex-col gap-5", className)} noValidate>
        {children}
        {fieldErrors?._ ? <p className="text-sm text-destructive">{fieldErrors._}</p> : null}
      </form>
    </FormProvider>
  );
}

export function FormRow({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  return <div className={cn("grid gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 4 && "sm:grid-cols-2 lg:grid-cols-4")}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 flex flex-col">
        <span className="text-sm font-semibold">{title}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}

type BaseProps<T extends FieldValues> = {
  name: FieldPath<T>;
  label: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function useFieldState<T extends FieldValues>(name: FieldPath<T>) {
  const { formState, getFieldState } = useFormContext<T>();
  const state = getFieldState(name, formState);
  return { error: state.error?.message as string | undefined };
}

export function FieldShell({ label, required, hint, error, children, htmlFor, className, inline }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string; className?: string; inline?: boolean }) {
  return (
    <div className={cn("flex min-w-0 gap-1.5", inline ? "flex-row items-center justify-between" : "flex-col", className)}>
      <Label htmlFor={htmlFor} className={cn("text-sm", error && "text-destructive")}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField<T extends FieldValues>({ name, label, required, hint, placeholder, className, type = "text", disabled, autoFocus, step }: BaseProps<T> & { type?: string; autoFocus?: boolean; step?: string }) {
  const { register } = useFormContext<T>();
  const { error } = useFieldState<T>(name);
  return (
    <FieldShell label={label} required={required} hint={hint} error={error} htmlFor={name} className={className}>
      <Input id={name} type={type} step={step} placeholder={placeholder} aria-invalid={Boolean(error)} disabled={disabled} autoFocus={autoFocus} {...register(name)} />
    </FieldShell>
  );
}

export function NumberField<T extends FieldValues>(props: BaseProps<T> & { step?: string; min?: number }) {
  const { register } = useFormContext<T>();
  const { error } = useFieldState<T>(props.name);
  return (
    <FieldShell label={props.label} required={props.required} hint={props.hint} error={error} htmlFor={props.name} className={props.className}>
      <Input id={props.name} type="number" inputMode="decimal" step={props.step ?? "any"} min={props.min} placeholder={props.placeholder} aria-invalid={Boolean(error)} disabled={props.disabled} {...register(props.name)} />
    </FieldShell>
  );
}

export function DateField<T extends FieldValues>(props: BaseProps<T> & { withTime?: boolean }) {
  const { register } = useFormContext<T>();
  const { error } = useFieldState<T>(props.name);
  return (
    <FieldShell label={props.label} required={props.required} hint={props.hint} error={error} htmlFor={props.name} className={props.className}>
      <Input id={props.name} type={props.withTime ? "datetime-local" : "date"} aria-invalid={Boolean(error)} disabled={props.disabled} {...register(props.name)} />
    </FieldShell>
  );
}

export function TextareaField<T extends FieldValues>(props: BaseProps<T> & { rows?: number }) {
  const { register } = useFormContext<T>();
  const { error } = useFieldState<T>(props.name);
  return (
    <FieldShell label={props.label} required={props.required} hint={props.hint} error={error} htmlFor={props.name} className={props.className}>
      <Textarea id={props.name} rows={props.rows ?? 3} placeholder={props.placeholder} aria-invalid={Boolean(error)} disabled={props.disabled} {...register(props.name)} />
    </FieldShell>
  );
}

export function SelectField<T extends FieldValues>({ options, allowEmpty, emptyLabel = "—", ...props }: BaseProps<T> & { options: { value: string; label: string }[]; allowEmpty?: boolean; emptyLabel?: string }) {
  const { control } = useFormContext<T>();
  const { error } = useFieldState<T>(props.name);
  return (
    <Controller
      control={control}
      name={props.name}
      render={({ field }) => (
        <FieldShell label={props.label} required={props.required} hint={props.hint} error={error} htmlFor={props.name} className={props.className}>
          <Select value={(field.value as string) || (allowEmpty ? "__none" : "")} onValueChange={(v) => field.onChange(v === "__none" ? "" : v)} disabled={props.disabled}>
            <SelectTrigger id={props.name} className="w-full" aria-invalid={Boolean(error)} onBlur={field.onBlur}>
              <SelectValue placeholder={props.placeholder ?? "Select…"} />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty ? <SelectItem value="__none">{emptyLabel}</SelectItem> : null}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>(props: BaseProps<T> & { description?: string }) {
  const { control } = useFormContext<T>();
  const { error } = useFieldState<T>(props.name);
  return (
    <Controller
      control={control}
      name={props.name}
      render={({ field }) => (
        <div className={cn("flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5", props.className)}>
          <div className="space-y-0.5">
            <Label htmlFor={props.name} className="text-sm">
              {props.label}
              {props.required ? <span className="ml-0.5 text-destructive">*</span> : null}
            </Label>
            {props.description ? <p className="text-xs text-muted-foreground">{props.description}</p> : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <Switch id={props.name} checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={props.disabled} />
        </div>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>(props: BaseProps<T> & { description?: React.ReactNode }) {
  const { control } = useFormContext<T>();
  const { error } = useFieldState<T>(props.name);
  return (
    <Controller
      control={control}
      name={props.name}
      render={({ field }) => (
        <div className={cn("flex flex-col gap-1", props.className)}>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" aria-invalid={Boolean(error)} disabled={props.disabled} />
            <span>
              <span className="font-medium">
                {props.label}
                {props.required ? <span className="ml-0.5 text-destructive">*</span> : null}
              </span>
              {props.description ? <span className="block text-xs text-muted-foreground">{props.description}</span> : null}
            </span>
          </label>
          {error ? <p className="pl-6 text-xs text-destructive">{error}</p> : null}
        </div>
      )}
    />
  );
}

export function SubmitButton({ pending, children, disabled, className }: { pending?: boolean; children: React.ReactNode; disabled?: boolean; className?: string }) {
  const { formState } = useFormContext();
  return (
    <Button type="submit" disabled={pending || disabled || !formState.isValid} className={className}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

export const COUNTRY_OPTIONS = ["AE", "AT", "AU", "BE", "BG", "CA", "CH", "CZ", "DE", "DK", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IL", "IN", "IT", "LT", "LV", "NL", "NO", "PL", "PT", "QA", "RO", "SA", "SE", "SK", "TR", "UA", "US", "ZA"].map((code) => {
  let label = code;
  try {
    label = new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    /* fall back to the code */
  }
  return { value: code, label };
});

export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "ILS", "AED", "CHF", "PLN", "SEK", "NOK", "DKK", "CZK", "RON", "CAD", "AUD"].map((c) => ({ value: c, label: c }));
export const PERIOD_OPTIONS = [
  { value: "hourly", label: "Per hour" },
  { value: "daily", label: "Per day" },
  { value: "weekly", label: "Per week" },
  { value: "monthly", label: "Per month" },
  { value: "annual", label: "Per year" },
];
export const LANGUAGE_OPTIONS = ["en", "de", "nl", "fr", "es", "it", "pl", "ro", "pt", "he", "ar", "ru", "uk", "tr", "hu", "cs", "sv", "no", "da"].map((code) => {
  let label = code;
  try {
    label = new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    /* fall back to the code */
  }
  return { value: code, label };
});
export const enumOptions = (values: readonly string[], labels?: Record<string, string>) => values.map((v) => ({ value: v, label: labels?.[v] ?? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));
