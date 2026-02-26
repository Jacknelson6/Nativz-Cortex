'use client';

import { useState, useEffect, useCallback } from 'react';
import { User2, Mail, Plus, Trash2, Star, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';

interface Contact {
  id: string;
  client_id: string;
  name: string;
  email: string;
  role: string | null;
  is_primary: boolean;
  created_at: string;
}

interface VaultContact {
  name: string;
  email: string;
  title?: string;
}

interface ClientContactsCardProps {
  clientId: string;
  clientName: string;
  vaultContacts?: VaultContact[];
  portalContacts?: Array<{
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    job_title: string | null;
    last_login: string | null;
  }>;
}

export function ClientContactsCard({ clientId, clientName, vaultContacts = [], portalContacts = [] }: ClientContactsCardProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('');

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  async function handleAdd() {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          role: newRole.trim() || null,
          is_primary: contacts.length === 0,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContacts((prev) => [...prev, data]);
      setNewName('');
      setNewEmail('');
      setNewRole('');
      setAdding(false);
      toast.success('Contact added');
    } catch {
      toast.error('Failed to add contact');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contactId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (!res.ok) throw new Error();
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      toast.success('Contact removed');
    } catch {
      toast.error('Failed to remove contact');
    }
  }

  async function handleSetPrimary(contactId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, is_primary: true }),
      });
      if (!res.ok) throw new Error();
      setContacts((prev) =>
        prev.map((c) => ({ ...c, is_primary: c.id === contactId }))
      );
      toast.success('Primary contact updated');
    } catch {
      toast.error('Failed to update primary contact');
    }
  }

  const hasAnyContacts = contacts.length > 0 || vaultContacts.length > 0 || portalContacts.length > 0;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text-primary">Points of contact</h2>
        <Button variant="ghost" size="sm" onClick={() => setAdding(!adding)}>
          <Plus size={14} />
          Add
        </Button>
      </div>

      {/* Add contact form */}
      {adding && (
        <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3 mb-4 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Role (optional)"
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleAdd} disabled={saving || !newName.trim() || !newEmail.trim()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : !hasAnyContacts ? (
        <EmptyState
          icon={<User2 size={24} />}
          title="No contacts yet"
          description={`Add contacts for ${clientName}.`}
        />
      ) : (
        <div className="space-y-3">
          {/* DB Contacts */}
          {contacts.map((contact) => (
            <div key={contact.id} className="flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text">
                <User2 size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">{contact.name}</p>
                  {contact.is_primary && (
                    <Badge variant="emerald" className="text-[9px] px-1 py-0">Primary</Badge>
                  )}
                </div>
                {contact.role && <p className="text-xs text-text-muted truncate">{contact.role}</p>}
                <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                  <Mail size={10} className="shrink-0" />
                  {contact.email}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!contact.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(contact.id)}
                    className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                    title="Set as primary"
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(contact.id)}
                  className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Remove contact"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* Vault Contacts (read-only, from Obsidian) */}
          {vaultContacts.map((contact, i) => (
            <div key={`vault-${i}`} className="flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text">
                <User2 size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{contact.name}</p>
                {contact.title && <p className="text-xs text-text-muted truncate">{contact.title}</p>}
                <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                  <Mail size={10} className="shrink-0" />
                  {contact.email}
                </p>
              </div>
              <Badge variant="default" className="text-[9px] px-1 py-0">Vault</Badge>
            </div>
          ))}

          {/* Portal Users (read-only) */}
          {portalContacts.map((contact) => (
            <div key={contact.id} className="flex items-center gap-3 rounded-lg border border-nativz-border bg-surface-hover/30 px-4 py-3">
              {contact.avatar_url ? (
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={contact.avatar_url} alt={contact.full_name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <User2 size={16} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{contact.full_name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="info" className="text-[9px] px-1 py-0">Portal</Badge>
                  {contact.job_title && <p className="text-xs text-text-muted truncate">{contact.job_title}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
