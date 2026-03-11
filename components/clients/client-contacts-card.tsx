'use client';

import { useState, useEffect, useCallback } from 'react';
import { User2, Mail, Phone, Plus, Pencil, Trash2, Star, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';

interface Contact {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  project_role: string | null;
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

const EMPTY_FORM = { name: '', email: '', phone: '', role: '', project_role: '', is_primary: false };

export function ClientContactsCard({ clientId, clientName, vaultContacts = [], portalContacts = [] }: ClientContactsCardProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

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

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  function openAdd() {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      role: contact.role ?? '',
      project_role: contact.project_role ?? '',
      is_primary: contact.is_primary,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role.trim() || null,
      project_role: form.project_role.trim() || null,
      is_primary: form.is_primary,
    };

    try {
      if (editingContact) {
        const res = await fetch(`/api/clients/${clientId}/contacts/${editingContact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        setContacts((prev) =>
          prev.map((c) => c.id === updated.id ? updated : (payload.is_primary ? { ...c, is_primary: false } : c))
        );
        toast.success('Contact updated');
      } else {
        const res = await fetch(`/api/clients/${clientId}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, is_primary: contacts.length === 0 || payload.is_primary }),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        if (created.is_primary) {
          setContacts((prev) => [created, ...prev.map((c) => ({ ...c, is_primary: false }))]);
        } else {
          setContacts((prev) => [...prev, created]);
        }
        toast.success('Contact added');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Failed to save contact');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contactId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${contactId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      toast.success('Contact removed');
    } catch {
      toast.error('Failed to remove contact');
    }
  }

  async function handleSetPrimary(contactId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });
      if (!res.ok) throw new Error();
      setContacts((prev) => prev.map((c) => ({ ...c, is_primary: c.id === contactId })));
      toast.success('Primary contact updated');
    } catch {
      toast.error('Failed to update primary contact');
    }
  }

  const hasAnyContacts = contacts.length > 0 || vaultContacts.length > 0 || portalContacts.length > 0;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Contacts</h2>
          <Button variant="ghost" size="sm" onClick={openAdd}>
            <Plus size={14} />
            Add
          </Button>
        </div>

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
          <div className="space-y-2">
            {contacts.map((contact) => (
              <div key={contact.id} className="group flex items-start gap-3 rounded-lg border border-nativz-border-light px-4 py-3 transition-colors hover:bg-surface-hover/30">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text mt-0.5">
                  <User2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate">{contact.name}</p>
                    {contact.is_primary && (
                      <Badge variant="emerald" className="text-[9px] px-1.5 py-0">Primary</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    {contact.role && (
                      <p className="text-xs text-text-muted">{contact.role}</p>
                    )}
                    {contact.project_role && (
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">{contact.project_role}</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="text-xs text-text-muted hover:text-accent-text transition-colors flex items-center gap-1 truncate">
                        <Mail size={10} className="shrink-0" />
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-xs text-text-muted hover:text-accent-text transition-colors flex items-center gap-1">
                        <Phone size={10} className="shrink-0" />
                        {contact.phone}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    onClick={() => openEdit(contact)}
                    className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:text-accent-text hover:bg-accent-surface transition-colors"
                    title="Edit contact"
                  >
                    <Pencil size={14} />
                  </button>
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

            {/* Vault contacts (read-only) */}
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

            {/* Portal users (read-only) */}
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

      {/* Add/Edit contact dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingContact ? 'Edit contact' : 'Add contact'}>
        <div className="space-y-3">
          <Input
            id="contact_name"
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Jane Smith"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="contact_email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
            />
            <Input
              id="contact_phone"
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+1 555-1234"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="contact_role"
              label="Company role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Marketing Director"
            />
            <Input
              id="contact_project_role"
              label="Project role"
              value={form.project_role}
              onChange={(e) => setForm((f) => ({ ...f, project_role: e.target.value }))}
              placeholder="e.g. Primary Contact"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
              className="accent-accent"
            />
            Primary contact
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editingContact ? 'Save changes' : 'Add contact'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
