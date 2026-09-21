"use client";

import * as React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Controller, useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { BoldIcon, ItalicIcon, ListIcon, ListOrderedIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { FieldShell } from "./form";

export function RichTextEditor({ value, onChange, onBlur, placeholder, className, minHeight = 120 }: { value: string; onChange: (html: string) => void; onBlur?: () => void; placeholder?: string; className?: string; minHeight?: number }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    immediatelyRender: false,
    editorProps: { attributes: { class: "tiptap prose-notes min-h-[var(--min-h)] px-3 py-2 text-sm focus:outline-none", "data-placeholder": placeholder ?? "" } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
    onBlur: () => onBlur?.(),
  });
  return (
    <div className={cn("rounded-lg border bg-background shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", className)} style={{ "--min-h": `${minHeight}px` } as React.CSSProperties}>
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()} className={cn(editor?.isActive("bold") && "bg-muted")}>
          <BoldIcon />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()} className={cn(editor?.isActive("italic") && "bg-muted")}>
          <ItalicIcon />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Bullet list" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={cn(editor?.isActive("bulletList") && "bg-muted")}>
          <ListIcon />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={cn(editor?.isActive("orderedList") && "bg-muted")}>
          <ListOrderedIcon />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextField<T extends FieldValues>({ name, label, required, hint, placeholder, className }: { name: FieldPath<T>; label: string; required?: boolean; hint?: string; placeholder?: string; className?: string }) {
  const { control, formState, getFieldState } = useFormContext<T>();
  const error = getFieldState(name, formState).error?.message as string | undefined;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FieldShell label={label} required={required} hint={hint} error={error} className={className}>
          <RichTextEditor value={(field.value as string) ?? ""} onChange={field.onChange} onBlur={field.onBlur} placeholder={placeholder} />
        </FieldShell>
      )}
    />
  );
}

export function RichText({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return <span className="text-muted-foreground">—</span>;
  // HTML is sanitised server-side before storage (see lib/sanitize).
  return <div className={cn("prose-notes text-sm", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
