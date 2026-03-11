'use client';

import { Badge } from '@/components/ui/badge';

export function ProfileField({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  const empty = !value?.trim();
  return (
    <div>
      <span className="block text-xs font-medium text-text-muted mb-0.5">{label}</span>
      {empty ? (
        <p className="text-sm text-text-muted italic">Not set</p>
      ) : isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-text hover:underline break-all">
          {value}
        </a>
      ) : (
        <p className="text-sm text-text-secondary whitespace-pre-line">{value}</p>
      )}
    </div>
  );
}

export function TagField({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div>
      <span className="block text-xs font-medium text-text-muted mb-1.5">{label}</span>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="default">{t}</Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted italic">Not set</p>
      )}
    </div>
  );
}

export function SectionLabel({ icon: Icon, label }: { icon: React.ComponentType<{ size: number; className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon size={14} className="text-text-muted" />
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <div className="flex-1 border-t border-nativz-border-light" />
    </div>
  );
}
