'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, Search } from 'lucide-react';
import { AgencyAssignmentLabel } from '@/components/clients/agency-assignment-label';
import { ClientLogo } from '@/components/clients/client-logo';
import { lockScroll, unlockScroll } from '@/lib/utils/scroll-lock';

export interface ClientOption {
  id: string;
  name: string;
  logo_url?: string | null;
  agency?: string | null;
}

// ─── Client picker button (opens bento modal) ───────────────────────────────

export function ClientPickerButton({
  clients,
  value,
  onChange,
  disabled,
  placeholder = 'Select a client',
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);

  return (
    <>
      {value && selected ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-accent/40 bg-accent-surface px-4 py-3 text-sm font-medium text-accent-text hover:bg-accent-surface/90 transition-colors"
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{selected.name}</span>
          <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          className={`flex w-full items-center gap-2.5 rounded-xl border border-nativz-border bg-surface px-4 py-3 text-sm text-text-muted hover:border-nativz-border/80 hover:text-text-secondary transition-colors ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{placeholder}</span>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <ClientPickerModal
          clients={clients}
          value={value}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Bento client picker modal ──────────────────────────────────────────────

export function ClientPickerModal({
  clients,
  value,
  onSelect,
  onClose,
}: {
  clients: ClientOption[];
  value: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    lockScroll();
    return () => unlockScroll();
  }, []);

  const filtered = search.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal — agency line matches research topic search (AgencyAssignmentLabel) */}
      <div className="relative w-full max-w-2xl rounded-xl border border-nativz-border bg-surface shadow-2xl animate-modal-pop-in">
        {/* Header */}
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text-primary">Select a client</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-lg border border-nativz-border bg-background py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>
        </div>

        {/* Bento grid */}
        <div className="px-5 pb-5 max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search size={20} className="mb-2 text-text-muted" />
              <p className="text-sm text-text-muted">No clients match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onSelect(client.id)}
                  className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors duration-200 ${
                    client.id === value
                      ? 'border-accent/50 bg-accent-surface font-medium text-accent-text shadow-[0_0_12px_var(--focus-ring)]'
                      : 'border-nativz-border bg-surface text-text-secondary hover:border-accent-border/40 hover:bg-surface-hover'
                  }`}
                >
                  <ClientLogo src={client.logo_url} name={client.name} size="sm" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate ${client.id === value ? 'text-accent-text' : 'text-text-primary'}`}
                    >
                      {client.name}
                    </p>
                    <div className="mt-1">
                      <AgencyAssignmentLabel agency={client.agency} showWhenUnassigned />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
