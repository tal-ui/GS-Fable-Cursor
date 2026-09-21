"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderTreeIcon, PencilIcon, PlusIcon, ScaleIcon, TagsIcon } from "lucide-react";
import { cn } from "cn";
import { upsertRoleFamilyAction, upsertSkillAction, upsertSkillCategoryAction } from "@/actions/admin";
import { EmptyState } from "@/components/app/empty-state";
import { Form, FormRow, FormSection, NumberField, SelectField, SubmitButton, SwitchField, TextField, TextareaField, useFieldValue, useZodForm } from "@/components/app/form";
import { KpiCard } from "@/components/app/kpi-card";
import { SlideOver } from "@/components/app/slide-over";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RankingWeights } from "@/db/schema";
import { roleFamilySchema, skillCategorySchema, skillSchema } from "@/lib/schemas/admin";
import { fmtPercent } from "@/lib/format";

type Category = { id: string; name: string; description: string | null; sortOrder: number };
type Skill = { id: string; code: string; name: string; categoryId: string; categoryName: string; description: string | null; ownerId: string | null; ownerName: string | null; isActive: boolean; defaultValidityMonths: number | null; synonyms: string[]; claimCount: number };
type RoleFamily = { id: string; code: string; name: string; description: string | null; rankingWeights: RankingWeights; rankingVersion: string; isActive: boolean };
type Option = { value: string; label: string };

const WEIGHT_COPY: { key: keyof RankingWeights; label: string; hint: string }[] = [
  { key: "skills", label: "Skills coverage", hint: "Share of preferred skills the candidate has" },
  { key: "proficiency", label: "Proficiency", hint: "Declared level vs. required level" },
  { key: "experience", label: "Experience", hint: "Years in role vs. requirement" },
  { key: "preferences", label: "Preferences fit", hint: "Location, rotation, compensation" },
  { key: "freshness", label: "Freshness", hint: "Recent availability and verification" },
];

export function TaxonomyView({ categories, skills, roleFamilies, owners, initialTab }: { categories: Category[]; skills: Skill[]; roleFamilies: RoleFamily[]; owners: Option[]; initialTab: string }) {
  const [tab, setTab] = React.useState<"skills" | "categories" | "families">(initialTab === "categories" || initialTab === "families" ? initialTab : "skills");
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [skillSheet, setSkillSheet] = React.useState<{ open: boolean; skill: Skill | null }>({ open: false, skill: null });
  const [categorySheet, setCategorySheet] = React.useState<{ open: boolean; category: Category | null }>({ open: false, category: null });
  const [familySheet, setFamilySheet] = React.useState<{ open: boolean; family: RoleFamily | null }>({ open: false, family: null });

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const visibleSkills = skills.filter((s) => (category === "all" || s.categoryId === category) && (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.code.includes(q.toLowerCase()) || s.synonyms.some((t) => t.includes(q.toLowerCase()))));
  const withoutSynonyms = skills.filter((s) => s.isActive && s.synonyms.length === 0).length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active skills" value={skills.filter((s) => s.isActive).length} hint={`${skills.length} total across ${categories.length} categories`} icon={TagsIcon} />
        <KpiCard label="Skills without synonyms" value={withoutSynonyms} hint="Synonyms improve extraction and import matching" />
        <KpiCard label="Claims on file" value={skills.reduce((s, x) => s + x.claimCount, 0)} hint="Candidate skill claims referencing the taxonomy" />
        <KpiCard label="Role families" value={roleFamilies.filter((f) => f.isActive).length} hint="Each carries its own ranking weights and version" icon={ScaleIcon} />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="skills">Skills ({skills.length})</TabsTrigger>
              <TabsTrigger value="categories">Categories ({categories.length})</TabsTrigger>
              <TabsTrigger value="families">Role families ({roleFamilies.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "skills" ? (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or synonym…" className="h-9 w-64" />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
          <div className="ml-auto">
            {tab === "skills" ? (
              <Button size="sm" onClick={() => setSkillSheet({ open: true, skill: null })} disabled={categories.length === 0}>
                <PlusIcon data-icon="inline-start" />
                New skill
              </Button>
            ) : tab === "categories" ? (
              <Button size="sm" onClick={() => setCategorySheet({ open: true, category: null })}>
                <PlusIcon data-icon="inline-start" />
                New category
              </Button>
            ) : (
              <Button size="sm" onClick={() => setFamilySheet({ open: true, family: null })}>
                <PlusIcon data-icon="inline-start" />
                New role family
              </Button>
            )}
          </div>
        </div>

        {tab === "skills" ? (
          visibleSkills.length === 0 ? (
            <EmptyState icon={TagsIcon} title={skills.length === 0 ? "No skills yet" : "No skills match"} description={skills.length === 0 ? "Create a category first, then add the skills your requisitions ask for." : "Try another search or category."} action={skills.length === 0 && categories.length > 0 ? <Button onClick={() => setSkillSheet({ open: true, skill: null })}>Add a skill</Button> : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Skill</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Synonyms</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Evidence validity</TableHead>
                  <TableHead className="text-right">Claims</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSkills.map((s) => (
                  <TableRow key={s.id} className={cn(!s.isActive && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        {!s.isActive ? <StatusBadge value="inactive" /> : null}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">{s.code}</p>
                    </TableCell>
                    <TableCell className="text-sm">{s.categoryName}</TableCell>
                    <TableCell>
                      {s.synonyms.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {s.synonyms.slice(0, 4).map((t) => (
                            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              {t}
                            </span>
                          ))}
                          {s.synonyms.length > 4 ? <span className="text-[11px] text-muted-foreground">+{s.synonyms.length - 4}</span> : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.defaultValidityMonths ? `${s.defaultValidityMonths} months` : "Does not expire"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.claimCount}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setSkillSheet({ open: true, skill: s })}>
                        <PencilIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : null}

        {tab === "categories" ? (
          categories.length === 0 ? (
            <EmptyState icon={FolderTreeIcon} title="No categories yet" description="Categories group skills for pickers and reports — e.g. Welding, Electrical, Licences, Languages." action={<Button onClick={() => setCategorySheet({ open: true, category: null })}>Add a category</Button>} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Skills</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{c.sortOrder}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{skills.filter((s) => s.categoryId === c.id).length}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setCategorySheet({ open: true, category: c })}>
                        <PencilIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : null}

        {tab === "families" ? (
          roleFamilies.length === 0 ? (
            <EmptyState icon={ScaleIcon} title="No role families yet" description="Role families group requisitions (e.g. Welders, Electricians, Drivers) and carry the ranking weights used to order eligible candidates." action={<Button onClick={() => setFamilySheet({ open: true, family: null })}>Add a role family</Button>} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role family</TableHead>
                  <TableHead>Ranking version</TableHead>
                  {WEIGHT_COPY.map((w) => (
                    <TableHead key={w.key} className="text-right">
                      {w.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleFamilies.map((f) => (
                  <TableRow key={f.id} className={cn(!f.isActive && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{f.name}</span>
                        {!f.isActive ? <StatusBadge value="inactive" /> : null}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">{f.code}</p>
                    </TableCell>
                    <TableCell>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{f.rankingVersion}</span>
                    </TableCell>
                    {WEIGHT_COPY.map((w) => (
                      <TableCell key={w.key} className="text-right tabular-nums">
                        {fmtPercent(f.rankingWeights[w.key])}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${f.name}`} onClick={() => setFamilySheet({ open: true, family: f })}>
                        <PencilIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : null}
      </div>

      {skillSheet.open ? <SkillSheet key={skillSheet.skill?.id ?? "new"} skill={skillSheet.skill} categories={categoryOptions} owners={owners} onClose={() => setSkillSheet({ open: false, skill: null })} /> : null}
      {categorySheet.open ? <CategorySheet key={categorySheet.category?.id ?? "new"} category={categorySheet.category} nextOrder={categories.length ? Math.max(...categories.map((c) => c.sortOrder)) + 10 : 10} onClose={() => setCategorySheet({ open: false, category: null })} /> : null}
      {familySheet.open ? <RoleFamilySheet key={familySheet.family?.id ?? "new"} family={familySheet.family} onClose={() => setFamilySheet({ open: false, family: null })} /> : null}
    </>
  );
}

function SkillSheet({ skill, categories, owners, onClose }: { skill: Skill | null; categories: Option[]; owners: Option[]; onClose: () => void }) {
  const router = useRouter();
  const form = useZodForm(skillSchema, {
    id: skill?.id ?? "",
    code: skill?.code ?? "",
    name: skill?.name ?? "",
    categoryId: skill?.categoryId ?? categories[0]?.value ?? "",
    description: skill?.description ?? "",
    ownerId: skill?.ownerId ?? "",
    isActive: skill?.isActive ?? true,
    defaultValidityMonths: skill?.defaultValidityMonths ?? "",
    synonyms: skill?.synonyms.join(", ") ?? "",
  });
  const { run, pending, fieldErrors } = useAction(upsertSkillAction, {
    successMessage: skill ? "Skill updated" : "Skill created",
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const name = useFieldValue(form, "name");
  React.useEffect(() => {
    if (skill || form.getFieldState("code").isDirty) return;
    form.setValue("code", String(name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), { shouldValidate: Boolean(name) });
  }, [name, skill, form]);

  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={skill ? `Edit ${skill.name}` : "New skill"} description="Skills are what requisitions require and candidates claim. Verification evidence attaches to a claim on a skill." size="md">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormRow>
          <TextField name="name" label="Name" placeholder="e.g. TIG welding, Forklift licence" required autoFocus />
          <TextField name="code" label="Code" placeholder="tig_welding" hint={skill ? "Codes never change once published." : "Stable identifier for imports and rules."} required disabled={Boolean(skill)} />
        </FormRow>
        <FormRow>
          <SelectField name="categoryId" label="Category" options={categories} required />
          <SelectField name="ownerId" label="Owner" options={owners} allowEmpty emptyLabel="Unassigned" hint="Who maintains synonyms and verification rules." />
        </FormRow>
        <TextareaField name="synonyms" label="Synonyms" placeholder="tig, gtaw, argon welding" hint="Comma-separated. Matched case-insensitively in CVs and imports." />
        <FormRow>
          <NumberField name="defaultValidityMonths" label="Evidence validity (months)" placeholder="Leave empty if it never expires" min={1} hint="Licences and certificates usually expire; verified claims become stale after this." />
          <TextField name="description" label="Description" placeholder="Short note for recruiters" />
        </FormRow>
        <SwitchField name="isActive" label="Active" description="Inactive skills stay on existing claims but cannot be selected for new requirements." />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{skill ? "Save" : "Create skill"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

function CategorySheet({ category, nextOrder, onClose }: { category: Category | null; nextOrder: number; onClose: () => void }) {
  const router = useRouter();
  const form = useZodForm(skillCategorySchema, { id: category?.id ?? "", name: category?.name ?? "", description: category?.description ?? "", sortOrder: category?.sortOrder ?? nextOrder });
  const { run, pending, fieldErrors } = useAction(upsertSkillCategoryAction, {
    successMessage: category ? "Category updated" : "Category created",
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={category ? `Edit ${category.name}` : "New category"} description="Categories group skills in pickers and reports." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <TextField name="name" label="Name" placeholder="e.g. Welding, Licences, Languages" required autoFocus />
        <TextareaField name="description" label="Description" placeholder="What belongs here" />
        <NumberField name="sortOrder" label="Sort order" hint="Lower numbers appear first." />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{category ? "Save" : "Create category"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

function RoleFamilySheet({ family, onClose }: { family: RoleFamily | null; onClose: () => void }) {
  const router = useRouter();
  const form = useZodForm(roleFamilySchema, {
    id: family?.id ?? "",
    code: family?.code ?? "",
    name: family?.name ?? "",
    description: family?.description ?? "",
    rankingVersion: family?.rankingVersion ?? "baseline-v1",
    weights: family?.rankingWeights ?? { skills: 0.4, proficiency: 0.15, experience: 0.15, preferences: 0.2, freshness: 0.1 },
    isActive: family?.isActive ?? true,
  });
  const { run, pending, fieldErrors } = useAction(upsertRoleFamilyAction, {
    successMessage: family ? "Role family updated" : "Role family created",
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const weights = useFieldValue(form, "weights");
  const total = WEIGHT_COPY.reduce((s, w) => s + (Number(weights?.[w.key]) || 0), 0);
  const balanced = Math.abs(total - 1) <= 0.01;
  const name = useFieldValue(form, "name");
  React.useEffect(() => {
    if (family || form.getFieldState("code").isDirty) return;
    form.setValue("code", String(name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), { shouldValidate: Boolean(name) });
  }, [name, family, form]);

  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={family ? `Edit ${family.name}` : "New role family"} description="Ranking weights only order candidates who already pass every mandatory rule. Changing weights bumps the ranking version so feedback stays comparable." size="md">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormRow>
          <TextField name="name" label="Name" placeholder="e.g. Welders, Electricians, HGV drivers" required autoFocus />
          <TextField name="code" label="Code" placeholder="welders" required disabled={Boolean(family)} />
        </FormRow>
        <TextareaField name="description" label="Description" placeholder="Which requisitions belong to this family" />
        <FormSection title="Ranking weights" description="Must add up to 1.00. Each weight is the share of the total score that component can contribute.">
          <div className="grid gap-3 sm:grid-cols-2">
            {WEIGHT_COPY.map((w) => (
              <NumberField key={w.key} name={`weights.${w.key}`} label={w.label} hint={w.hint} step="0.05" min={0} />
            ))}
          </div>
          <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm", balanced ? "border-success/40 bg-success-soft text-success-foreground" : "border-warning/40 bg-warning-soft text-warning-foreground")}>
            <span>Total</span>
            <span className="tabular-nums font-semibold">{total.toFixed(2)}</span>
          </div>
        </FormSection>
        <FormRow>
          <TextField name="rankingVersion" label="Ranking version" hint="Recorded on every match snapshot and feedback row." required />
          <SwitchField name="isActive" label="Active" description="Inactive families cannot be chosen on new requisitions." />
        </FormRow>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending} disabled={!balanced}>
            {family ? "Save" : "Create role family"}
          </SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
