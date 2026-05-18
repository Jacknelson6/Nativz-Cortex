# Components (primitives)

Flat catalog of `components/ui/*`. Grep by name. Every primitive lives in one file under this directory. **Always import from `@/components/ui/<name>`. Never copy/fork a primitive.**

For tokens (colors, spacing, radii) used by these primitives, see `/DESIGN_SYSTEM.md`.

---

## Inputs

### Button, `button.tsx`
Canonical button. Use this 99% of the time.

| Prop | Type | Default | Required |
|---|---|---|---|
| variant | `"primary" \| "secondary" \| "outline" \| "ghost" \| "danger" \| "success"` | `"primary"` | no |
| size | `"xs" \| "sm" \| "md" \| "lg"` | `"md"` | no |
| shape | `"default" \| "pill"` | `"default"` | no |
| children | `ReactNode` | - | yes |

Plus all `<button>` HTML attrs (onClick, disabled, type, etc.).

```tsx
<Button variant="primary" onClick={save}>Save</Button>
```

**Use this when:** form submits, table actions, modals, sidebar CTAs, anywhere in admin/portal UI.
**Don't use when:** marketing hero CTA (→ `GlowButton`), frosted-glass landing aesthetic (→ `GlassButton`).
**Use instead of:** native `<button>`, custom Tailwind button styling.

### GlassButton, `glass-button.tsx`
Frosted-glass aesthetic with backdrop blur. Marketing surfaces only.

| Prop | Type | Default | Required |
|---|---|---|---|
| loading | `boolean` | - | no |
| children | `ReactNode` | - | yes |

Plus all `<button>` HTML attrs.

```tsx
<GlassButton onClick={...}>Learn more</GlassButton>
```

**Use this when:** marketing landing pages, share/present surfaces over imagery.
**Don't use when:** admin or portal UI (→ `Button`), hero CTA (→ `GlowButton`).

### GlowButton, `glow-button.tsx`
Animated glow ring. Hero CTA only.

| Prop | Type | Default | Required |
|---|---|---|---|
| loading | `boolean` | - | no |
| children | `ReactNode` | - | yes |

Plus all `<button>` HTML attrs.

```tsx
<GlowButton onClick={start}>Start free trial</GlowButton>
```

**Use this when:** primary hero CTA on landing / pricing / present surfaces. One per page max.
**Don't use when:** anywhere in product UI (→ `Button`), secondary marketing CTA (→ `GlassButton`).

### Input, `input.tsx`
Canonical text input. Also exports `Textarea`.

| Prop | Type | Default | Required |
|---|---|---|---|
| label | `string` | - | no |
| error | `string` | - | no |

Plus all `<input>` HTML attrs (value, onChange, type, placeholder, etc.).

```tsx
<Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
```

**Use instead of:** raw `<input>` with manual label/error markup.

### Textarea, `input.tsx`
Same shape as `Input` but renders `<textarea>`. Same `label` + `error` props.

```tsx
<Textarea label="Bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
```

### Checkbox, `checkbox.tsx`
Radix Checkbox. Supports indeterminate state.

| Prop | Type | Default | Required |
|---|---|---|---|
| checked | `boolean \| "indeterminate"` | - | no |
| onCheckedChange | `(checked: boolean \| "indeterminate") => void` | - | no |

Plus all Radix `CheckboxPrimitive.Root` props.

```tsx
<Checkbox checked={agree} onCheckedChange={setAgree} />
```

**Use instead of:** raw `<input type="checkbox">`.

### Select, `select.tsx`
Native `<select>` with custom icon + error display.

| Prop | Type | Default | Required |
|---|---|---|---|
| label | `string` | - | no |
| error | `string` | - | no |
| options | `{ value: string; label: string }[]` | - | yes |

Plus all `<select>` HTML attrs.

```tsx
<Select label="Role" options={[{value:'admin',label:'Admin'}]} value={role} onChange={(e) => setRole(e.target.value)} />
```

**Use this when:** short, fixed option list, no search needed.
**Don't use when:** options need filtering (→ `ComboSelect`).

### ComboSelect, `combo-select.tsx`
Searchable dropdown with custom render.

| Prop | Type | Default | Required |
|---|---|---|---|
| label | `string` | - | no |
| options | `ComboSelectOption[]` | - | yes |
| value | `string` | - | yes |
| onChange | `(value: string) => void` | - | yes |
| placeholder | `string` | `"Select…"` | no |
| searchable | `boolean` | `true` | no |
| dropdownPosition | `"bottom" \| "top"` | `"bottom"` | no |
| accent | `"blue" \| "purple"` | `"blue"` | no |

```tsx
<ComboSelect label="Client" options={clientOpts} value={clientId} onChange={setClientId} />
```

**Use this when:** option list is long enough to need search.
**Use instead of:** raw `<select>` with manual search.

### Toggle, `toggle.tsx`
Switch with label + description.

| Prop | Type | Default | Required |
|---|---|---|---|
| checked | `boolean` | - | yes |
| onChange | `(checked: boolean) => void` | - | yes |
| label | `string` | - | yes |
| description | `string` | - | no |
| disabled | `boolean` | `false` | no |

```tsx
<Toggle label="Notifications" description="Email me on new comments" checked={notify} onChange={setNotify} />
```

**Use instead of:** raw checkbox + label markup for boolean preferences.

### TagInput, `tag-input.tsx`
Pill-shaped tag entry. Enter/comma to add, Backspace to remove last.

| Prop | Type | Default | Required |
|---|---|---|---|
| id | `string` | - | no |
| label | `string` | - | no |
| value | `string[]` | - | yes |
| onChange | `(tags: string[]) => void` | - | yes |
| placeholder | `string` | `"Type and press Enter"` | no |
| maxTags | `number` | `20` | no |
| error | `string` | - | no |

```tsx
<TagInput label="Keywords" value={tags} onChange={setTags} maxTags={10} />
```

### DateTimePicker, `date-time-picker.tsx`
Combined date + time picker. Date is `YYYY-MM-DD`, time is `HH:MM` 24h.

| Prop | Type | Default | Required |
|---|---|---|---|
| date | `string` | - | yes |
| time | `string` | - | yes |
| onDateChange | `(date: string) => void` | - | yes |
| onTimeChange | `(time: string) => void` | - | yes |

```tsx
<DateTimePicker date={d} time={t} onDateChange={setD} onTimeChange={setT} />
```

**Notes:** disables past dates. Displays in 12h, stores 24h.

### TimePicker15, `time-picker-15.tsx`
15-minute interval time picker.

| Prop | Type | Default | Required |
|---|---|---|---|
| value | `string` | - | yes |
| onChange | `(hhmm: string) => void` | - | yes |
| disabled | `boolean` | - | no |
| id | `string` | - | no |
| className | `string` | - | no |

```tsx
<TimePicker15 value={"09:15"} onChange={setTime} />
```

### ScheduleRangePicker, `schedule-range-picker.tsx`
Forward-looking date range picker with preset sidebar.

| Prop | Type | Default | Required |
|---|---|---|---|
| value | `ScheduleRange` | - | yes |
| onChange | `(next: ScheduleRange) => void` | - | yes |
| disabled | `boolean` | - | no |

```tsx
<ScheduleRangePicker value={range} onChange={setRange} />
```

**Notes:** disables past dates.

### ImageUpload, `image-upload.tsx`
Drop zone + preview. Accepts JPEG, PNG, WebP, SVG. Max 2MB.

| Prop | Type | Default | Required |
|---|---|---|---|
| value | `string \| null` | - | yes |
| onChange | `(url: string \| null) => void` | - | yes |
| size | `"sm" \| "md" \| "lg"` | `"md"` | no |
| label | `string` | - | no |

```tsx
<ImageUpload label="Logo" value={logo} onChange={setLogo} />
```

### AvatarEditor, `avatar-editor.tsx`
Canvas-based avatar crop + zoom.

| Prop | Type | Default | Required |
|---|---|---|---|
| value | `string \| null` | - | yes |
| onChange | `(url: string) => void` | - | yes |
| size | `"sm" \| "md" \| "lg"` | `"lg"` | no |

```tsx
<AvatarEditor value={avatar} onChange={setAvatar} />
```

### ClientPickerButton, `client-picker.tsx`
Client/org selector with bento-grid modal.

| Prop | Type | Default | Required |
|---|---|---|---|
| clients | `ClientOption[]` | - | yes |
| value | `string \| null` | - | yes |
| onChange | `(id: string \| null) => void` | - | yes |
| disabled | `boolean` | - | no |
| placeholder | `string` | `"Select a client"` | no |

```tsx
<ClientPickerButton clients={clients} value={clientId} onChange={setClientId} />
```

### ClientPortfolioSelector, `client-portfolio-selector.tsx`
Multi-client portfolio grid with status dots (connected/disconnected/paused).

| Prop | Type | Default | Required |
|---|---|---|---|
| clients | `PortfolioClient[]` | - | yes |
| onSelect | `(clientId: string) => void` | - | yes |
| title | `string` | `"Select a client"` | no |
| subtitle | `string` | - | no |

```tsx
<ClientPortfolioSelector clients={clients} onSelect={setClient} title="Choose a brand" />
```

---

## Layout

### Card, `card.tsx`
Surface container. Exports `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` for composition.

| Prop | Type | Default | Required |
|---|---|---|---|
| padding | `"none" \| "sm" \| "md" \| "lg"` | `"md"` | no |
| interactive | `boolean` | `false` | no |
| elevated | `boolean` | `false` | no |

Plus all `<div>` HTML attrs.

```tsx
<Card padding="none">
  <CardHeader><CardTitle>Stats</CardTitle></CardHeader>
  <CardContent>{content}</CardContent>
</Card>
```

**Use instead of:** ad-hoc `<div className="bg-surface rounded-md p-4">…</div>`.

### IconCard, `icon-card.tsx`
Section card with leading icon swatch + optional help tooltip.

| Prop | Type | Default | Required |
|---|---|---|---|
| icon | `ReactNode` | - | yes |
| title | `string` | - | yes |
| description | `string` | - | no |
| helpText | `string` | - | no |
| helpTitle | `string` | - | no |
| action | `ReactNode` | - | no |
| tone | `"accent" \| "muted"` | `"accent"` | no |
| className | `string` | - | no |
| children | `ReactNode` | - | yes |

```tsx
<IconCard icon={<Zap />} title="Quick actions" tone="accent">{children}</IconCard>
```

### SpotlightCard, `spotlight-card.tsx`
Card with radial gradient that follows mouse on hover. Marketing.

| Prop | Type | Default | Required |
|---|---|---|---|
| children | `ReactNode` | - | yes |
| className | `string` | - | no |
| spotlightColor | `string` | `"rgba(91, 163, 230, 0.15)"` | no |

```tsx
<SpotlightCard>{children}</SpotlightCard>
```

**Don't use in:** admin or portal UI (→ `Card`).

### SubNav, `sub-nav.tsx`
Secondary tab nav. Also exports `SubNavLinks` (router.push variant with localStorage memory).

| Prop | Type | Default | Required |
|---|---|---|---|
| items | `readonly SubNavItem<TSlug>[]` | - | yes |
| active | `TSlug` | - | yes |
| onChange | `(slug: TSlug) => void` | - | yes |
| ariaLabel | `string` | - | no |

```tsx
<SubNav items={tabs} active={tab} onChange={setTab} />
```

**Use instead of:** ad-hoc tab buttons.

### Stepper, `stepper.tsx`
Numbered horizontal stepper with animated connectors.

| Prop | Type | Default | Required |
|---|---|---|---|
| steps | `StepperStep<TKey>[]` | - | yes |
| currentStep | `TKey` | - | yes |
| completedSteps | `TKey[]` | - | yes |
| className | `string` | - | no |

```tsx
<Stepper steps={steps} currentStep="connect" completedSteps={["choose"]} />
```

### FloatingDock, `floating-dock.tsx`
Sticky bottom action dock. Collapsed mode shows tooltips on hover.

| Prop | Type | Default | Required |
|---|---|---|---|
| items | `DockItem[]` | - | yes |
| collapsed | `boolean` | `false` | no |
| className | `string` | - | no |

```tsx
<FloatingDock items={actions} />
```

### PageShellSkeleton, `page-shell-skeleton.tsx`
Full-page skeleton. Also exports `SettingsShellSkeleton`, `ProcessingShellSkeleton`.

| Prop | Type | Default | Required |
|---|---|---|---|
| tiles | `number` | `6` | no |
| showTopKicker | `boolean` | `true` | no |
| showAction | `boolean` | `false` | no |
| grid | `"cards" \| "rows"` | `"cards"` | no |

```tsx
// In a route loading.tsx
export default function Loading() { return <PageShellSkeleton tiles={4} />; }
```

**Use instead of:** ad-hoc skeleton compositions per page.

---

## Feedback

### Badge, `badge.tsx`
Inline status pill.

| Prop | Type | Default | Required |
|---|---|---|---|
| variant | `"default" \| "success" \| "warning" \| "danger" \| "info" \| "purple" \| "coral" \| "mono" \| "emerald"` | `"default"` | no |
| children | `ReactNode` | - | yes |

Plus all `<span>` HTML attrs.

```tsx
<Badge variant="success">Active</Badge>
```

**Use instead of:** custom colored pill divs.

### Skeleton, `skeleton.tsx`
Single shimmer block on `--surface-elevated`. Also exports `SkeletonGroup`, `CardSkeleton`, `TableSkeleton`, `DashboardSkeleton`.

| Prop | Type | Default | Required |
|---|---|---|---|
| className | `string` | - | no |

Plus all `<div>` HTML attrs.

```tsx
<Skeleton className="h-4 w-24" />
```

**Use instead of:** ad-hoc `<div className="animate-pulse bg-surface" />` blocks.

### LoadingSkeletons, `loading-skeletons.tsx`
Higher-level skeleton patterns. Exports `SkeletonRows`, `SkeletonCards`, `SkeletonTable`, `InlineSpinner`.

`SkeletonRows`:

| Prop | Type | Default | Required |
|---|---|---|---|
| count | `number` | `6` | no |
| withAvatar | `boolean` | `true` | no |

```tsx
<SkeletonRows count={5} withAvatar={false} />
<InlineSpinner />
```

**Use this when:** you need a multi-row skeleton, not just one block.

### ScrollProgress, `scroll-progress.tsx`
Thin accent bar pinned to viewport top, scales with scroll.

| Prop | Type | Default | Required |
|---|---|---|---|
| className | `string` | - | no |

```tsx
<ScrollProgress />
```

### ScrollToTop, `scroll-to-top.tsx`
Fixed bottom-right FAB. Appears after 400px scroll. No props.

```tsx
<ScrollToTop />
```

### EncryptedText, `encrypted-text.tsx`
Char-scramble reveal animation. Marketing flourishes.

| Prop | Type | Default | Required |
|---|---|---|---|
| text | `string` | - | yes |
| revealDelayMs | `number` | `50` | no |
| characterSet | `string` | `DEFAULT_CHARS` | no |
| className | `string` | `""` | no |

```tsx
<EncryptedText text="Decoded." />
```

### TextFlip, `text-flip.tsx`
Cycles through words with vertical translateY flip animation.

| Prop | Type | Default | Required |
|---|---|---|---|
| words | `string[]` | - | yes |
| interval | `number` | `3000` | no |
| className | `string` | - | no |

```tsx
<TextFlip words={["fast", "polished", "AI-native"]} />
```

---

## Overlays

### Dialog, `dialog.tsx`
Canonical modal shell, built on native `<dialog>` with `showModal()` for top-layer stacking.

| Prop | Type | Default | Required |
|---|---|---|---|
| open | `boolean` | - | yes |
| onClose | `() => void` | - | yes |
| title | `string` | - | no |
| children | `ReactNode` | - | yes |
| maxWidth | `"sm" \| "md" \| "lg" \| "xl" \| "2xl" \| "5xl" \| "6xl" \| "7xl" \| "full"` | `"md"` | no |
| className | `string` | - | no |
| bodyClassName | `string` | - | no |
| onCancel | `(e: SyntheticEvent<HTMLDialogElement>) => void` | - | no |
| placement | `"center" \| "right"` | `"center"` | no |

```tsx
<Dialog open={open} onClose={close} title="Edit client" maxWidth="lg">{form}</Dialog>
```

**Use this when:** any feature modal, wrap, don't fork.
**Don't use when:** simple yes/no confirm (→ `ConfirmDialog`).
**Use instead of:** building modals from Radix Dialog directly or rolling your own portal.

### ConfirmDialog, `confirm-dialog.tsx`
Yes/no confirm built on `Dialog`. Ships with a `useConfirm()` hook returning a `Promise<boolean>`.

| Prop | Type | Default | Required |
|---|---|---|---|
| open | `boolean` | - | yes |
| title | `string` | - | yes |
| description | `string` | - | yes |
| confirmLabel | `string` | `"Confirm"` | no |
| cancelLabel | `string` | `"Cancel"` | no |
| variant | `"danger" \| "default" \| "success"` | `"danger"` | no |
| onConfirm | `() => void` | - | yes |
| onCancel | `() => void` | - | yes |

```tsx
const { confirm, dialog } = useConfirm();
const ok = await confirm({ title: "Delete client?", description: "Cannot be undone." });
if (ok) deleteClient();
return dialog; // render once at the page root
```

**Use this when:** destructive or two-state confirmation.
**Use instead of:** custom inline confirm modals, `window.confirm`.

### DropdownMenu, `dropdown-menu.tsx`
Radix DropdownMenu re-export with token theming. Sub-exports: `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup/Item`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub/SubTrigger/SubContent`, `DropdownMenuPortal`, `DropdownMenuGroup`.

Inherits all Radix `DropdownMenuPrimitive.Root` props.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="ghost">Actions</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onSelect={edit}>Edit</DropdownMenuItem>
    <DropdownMenuItem onSelect={del}>Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Use this when:** click-to-open action menus (row actions, header overflow).
**Don't use when:** right-click contextual menu (→ `ContextMenu`).

### ContextMenu, `context-menu.tsx`
Radix ContextMenu re-export with token theming. Same shape as `DropdownMenu` but triggered by right-click.

Inherits all Radix `ContextMenuPrimitive.Root` props.

```tsx
<ContextMenu>
  <ContextMenuTrigger>{row}</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onSelect={edit}>Edit</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

### Popover, `popover.tsx`
Radix Popover with token theming. Critical: set `disablePortal` when nesting inside a native `<dialog>`.

| Prop | Type | Default | Required |
|---|---|---|---|
| matchAnchorWidth | `boolean` | `true` | no |
| disablePortal | `boolean` | `false` | no |

Plus all Radix `PopoverPrimitive.Root` props.

```tsx
<Popover>
  <PopoverTrigger asChild><Button variant="ghost">?</Button></PopoverTrigger>
  <PopoverContent>{help}</PopoverContent>
</Popover>
```

**Notes:** inside `Dialog`, pass `disablePortal` to avoid stacking-context issues.

### Tooltip, `tooltip.tsx`
Radix Tooltip with token theming. Default delay 150ms.

Inherits all Radix `TooltipPrimitive.Root` props. Sub-exports: `TooltipTrigger`, `TooltipContent`, `TooltipProvider`.

```tsx
<Tooltip>
  <TooltipTrigger asChild><InfoIcon /></TooltipTrigger>
  <TooltipContent>Short hint</TooltipContent>
</Tooltip>
```

**Use this when:** short hint, single-line, no structured content.
**Don't use when:** structured content with title + body (→ `TooltipCard`).

### TooltipCard, `tooltip-card.tsx`
Larger tooltip with structured title + description. 200ms delay, portaled to body, 300px wide.

| Prop | Type | Default | Required |
|---|---|---|---|
| title | `string` | - | yes |
| description | `string` | - | yes |
| children | `ReactNode` | - | yes |
| iconTrigger | `boolean` | `false` | no |

```tsx
<TooltipCard title="Engagement rate" description="Likes plus comments divided by impressions.">
  <span>ER</span>
</TooltipCard>
```

**Use this when:** explaining a metric, defining a term, or anywhere you need a small block of content on hover.
**Don't use when:** one-line label hint (→ `Tooltip`).

---

## Data display

### Table, `table.tsx`
Semantic table primitive with variant-aware shells. Exports `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`.

`Table`:

| Prop | Type | Default | Required |
|---|---|---|---|
| variant | `"default" \| "card"` | `"default"` | no |
| containerClassName | `string` | - | no |

Plus all `<table>` HTML attrs.

```tsx
<Table variant="card">
  <TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader>
  <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell>{r.name}</TableCell></TableRow>)}</TableBody>
</Table>
```

**Use this when:** any tabular data display.
**Use instead of:** raw `<table>` with custom Tailwind.
**Notes:** this is a primitive set, not a full `DataTable`. Sort, pagination, and selection are caller-owned for now. Flagged in `FOUNDATION_AUDIT.md` as a future consolidation opportunity.

---

## Variant decision matrix (quick reference)

| Need | Use |
|---|---|
| Any button in admin/portal UI | `Button` |
| Marketing CTA over imagery, frosted glass | `GlassButton` |
| Single hero CTA on landing/pricing | `GlowButton` |
| One-line label hint | `Tooltip` |
| Metric definition, structured hover block | `TooltipCard` |
| Click-to-open action menu | `DropdownMenu` |
| Right-click contextual menu | `ContextMenu` |
| Yes/no confirmation | `ConfirmDialog` (via `useConfirm`) |
| Any other modal | `Dialog` |
| Fixed-option select | `Select` |
| Searchable select | `ComboSelect` |
| Multi-row list loading | `SkeletonRows` from `loading-skeletons.tsx` |
| Full route loading | `PageShellSkeleton` in `loading.tsx` |
| Single block loading | `Skeleton` |

---

## Out of scope (flagged in `FOUNDATION_AUDIT.md`, not built)

- No `FeatureModal` shell over `Dialog` yet, feature modals compose `Dialog` directly.
- No `DataTable` over `Table` yet, sort/pagination/selection are caller-owned.
- No mass-migration of inline `<EmptyState />` rolls; existing shared component lives at `components/shared/empty-state.tsx`.
