# Component patterns

The four main UI patterns used in Nativz Cortex. All use CSS variable tokens -- never hardcode colors.

## 1. Data card

A `<Card>` with header, stats, and optional actions.

```tsx
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export function FeatureCard({ item }: { item: ItemType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
        <span className="text-xs text-text-muted">{item.date}</span>
      </CardHeader>
      <div className="space-y-2">
        <p className="text-sm text-text-secondary">{item.description}</p>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-text-primary">{item.stat}</span>
          <span className="text-xs text-text-muted">label</span>
        </div>
      </div>
    </Card>
  );
}
```

Use `interactive` prop when the card is a link: `<Card interactive>`.

## 2. Data table

Table with sortable headers and row borders.

```tsx
export function FeatureTable({ items }: { items: ItemType[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-nativz-border">
            <th className="text-left text-xs text-text-muted font-medium py-3 px-4">Name</th>
            <th className="text-left text-xs text-text-muted font-medium py-3 px-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-nativz-border hover:bg-surface/50 transition-colors">
              <td className="text-sm text-text-primary py-3 px-4">{item.name}</td>
              <td className="text-sm text-text-secondary py-3 px-4">{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## 3. Form

Inputs with dark theme tokens, loading state button, and error/success messages.

```tsx
'use client';

import { useState } from 'react';

export function FeatureForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1">Name</label>
        <input
          id="name"
          type="text"
          className="w-full px-3 py-2 bg-background border border-nativz-border rounded-lg text-text-primary placeholder:text-text-muted focus:shadow-[0_0_0_3px_var(--focus-ring)] focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

## 4. Modal / sheet

Overlay for detail views. Uses the project's `<Dialog>` component.

```tsx
'use client';

import { Dialog } from '@/components/ui/dialog';

export function FeatureModal({ open, onClose, item }: FeatureModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <div className="bg-surface border border-nativz-border rounded-xl p-6 max-w-lg w-full">
        <h2 className="text-lg font-semibold text-text-primary mb-4">{item.title}</h2>
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">{item.body}</p>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors">
            Confirm
          </button>
        </div>
      </div>
    </Dialog>
  );
}
```

---

For micro-interaction patterns (hover states, transitions, loading animations), see `docs/detail-design-patterns.md`.
