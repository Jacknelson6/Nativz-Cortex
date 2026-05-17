/**
 * Shared section primitives for the content-tools detail dialogs
 * (`EditingProjectDetail` + `CalendarLinkDetail`). Both modals stack
 * label-prefixed sections, so lifting the wrappers into one place keeps
 * the visual rhythm in lockstep.
 *
 *  - `Section`  : label above content block, uppercase tracking-wide caption.
 *  - `Field`    : `<dt>/<dd>` pair, used inside the metadata grid.
 *  - `SideField`: form-style label for `<select>`/`<input>` rows.
 */

export function Section({
  label,
  extra,
  children,
}: {
  label: string;
  /** Optional right-rail content beside the label (e.g. role selector). */
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          {label}
        </p>
        {extra ? <div className="shrink-0">{extra}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function SideField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
