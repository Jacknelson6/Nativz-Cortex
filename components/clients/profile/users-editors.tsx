'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, MoreHorizontal, Star } from 'lucide-react';
import {
  SectionEditor,
  EditorField,
  editorInputClass,
} from './section-editor';

type ContactDraft = {
  name: string;
  email: string;
  phone: string;
  role: string;
  project_role: string;
  is_primary: boolean;
};

const emptyContact: ContactDraft = {
  name: '',
  email: '',
  phone: '',
  role: '',
  project_role: '',
  is_primary: false,
};

function buildContactBody(d: ContactDraft) {
  return {
    name: d.name.trim(),
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    role: d.role.trim() || null,
    project_role: d.project_role.trim() || null,
    is_primary: d.is_primary,
  };
}

export function AddContactButton({ clientId }: { clientId: string }) {
  return (
    <SectionEditor<ContactDraft>
      label="Add"
      title="Add contact"
      description="The team uses contacts to know who to email for approvals + project questions."
      initial={emptyContact}
      endpoint={`/api/clients/${clientId}/contacts`}
      method="POST"
      validate={(d) => (d.name.trim() ? null : 'Name is required')}
      buildBody={buildContactBody}
    >
      {(d, set) => <ContactFormFields draft={d} set={set} />}
    </SectionEditor>
  );
}

export function EditContactButton({
  clientId,
  contact,
}: {
  clientId: string;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
    project_role: string | null;
    is_primary: boolean;
  };
}) {
  return (
    <SectionEditor<ContactDraft>
      label="Edit"
      title="Edit contact"
      initial={{
        name: contact.name,
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        role: contact.role ?? '',
        project_role: contact.project_role ?? '',
        is_primary: contact.is_primary,
      }}
      endpoint={`/api/clients/${clientId}/contacts/${contact.id}`}
      method="PATCH"
      validate={(d) => (d.name.trim() ? null : 'Name is required')}
      buildBody={buildContactBody}
    >
      {(d, set) => <ContactFormFields draft={d} set={set} />}
    </SectionEditor>
  );
}

function ContactFormFields({
  draft,
  set,
}: {
  draft: ContactDraft;
  set: (patch: Partial<ContactDraft>) => void;
}) {
  return (
    <>
      <EditorField label="Name">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          className={editorInputClass}
          placeholder="Jane Smith"
        />
      </EditorField>
      <EditorField label="Email">
        <input
          type="email"
          value={draft.email}
          onChange={(e) => set({ email: e.target.value })}
          className={editorInputClass}
          placeholder="jane@company.com"
        />
      </EditorField>
      <EditorField label="Phone">
        <input
          type="tel"
          value={draft.phone}
          onChange={(e) => set({ phone: e.target.value })}
          className={editorInputClass}
          placeholder="+1 555 123 4567"
        />
      </EditorField>
      <EditorField label="Title" hint="Their job title — e.g. CMO, Founder, Brand Lead.">
        <input
          type="text"
          value={draft.role}
          onChange={(e) => set({ role: e.target.value })}
          className={editorInputClass}
        />
      </EditorField>
      <EditorField
        label="Project role"
        hint="What they own on our side — Approvals, Strategy POC, Billing, etc."
      >
        <input
          type="text"
          value={draft.project_role}
          onChange={(e) => set({ project_role: e.target.value })}
          className={editorInputClass}
        />
      </EditorField>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={draft.is_primary}
          onChange={(e) => set({ is_primary: e.target.checked })}
          className="h-4 w-4 rounded border-nativz-border bg-background accent-accent"
        />
        Primary point of contact
      </label>
    </>
  );
}

type InviteDraft = { email: string; contact_name: string };

export function InviteButton({ clientId }: { clientId: string }) {
  return (
    <SectionEditor<InviteDraft>
      label="Invite"
      title="Invite to portal"
      description="They'll get a branded email with a join link. The link is good for 14 days."
      initial={{ email: '', contact_name: '' }}
      endpoint="/api/invites"
      method="POST"
      validate={(d) => (d.email.trim() ? null : 'Email is required')}
      buildBody={(d) => ({
        client_id: clientId,
        email: d.email.trim(),
        contact_name: d.contact_name.trim() || undefined,
      })}
    >
      {(d, set) => (
        <>
          <EditorField label="Email">
            <input
              type="email"
              value={d.email}
              onChange={(e) => set({ email: e.target.value })}
              className={editorInputClass}
              placeholder="client@company.com"
            />
          </EditorField>
          <EditorField label="Their name" hint="Used in the email greeting.">
            <input
              type="text"
              value={d.contact_name}
              onChange={(e) => set({ contact_name: e.target.value })}
              className={editorInputClass}
            />
          </EditorField>
        </>
      )}
    </SectionEditor>
  );
}

/**
 * Tiny inline row action menu. Confirms + deletes on click. We keep it
 * deliberately barebones — copy invite URL, revoke, remove access, delete
 * contact all collapse into a single "•••" trigger so the row stays clean.
 */
export function RowActions({
  items,
}: {
  items: { label: string; onSelect: () => void | Promise<void>; destructive?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover"
        aria-label="Row actions"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default bg-transparent"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-nativz-border bg-surface text-xs shadow-xl">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={async () => {
                  setOpen(false);
                  setBusy(true);
                  try {
                    await item.onSelect();
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`block w-full px-3 py-2 text-left transition-colors hover:bg-surface-hover ${
                  item.destructive ? 'text-rose-300 hover:text-rose-200' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function DeleteContactAction({
  clientId,
  contactId,
  name,
}: {
  clientId: string;
  contactId: string;
  name: string;
}) {
  const router = useRouter();

  async function deleteContact() {
    if (!confirm(`Remove ${name}? This can't be undone.`)) return;
    const res = await fetch(`/api/clients/${clientId}/contacts/${contactId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    toast.success('Contact removed');
    router.refresh();
  }

  return <RowActions items={[{ label: 'Remove contact', onSelect: deleteContact, destructive: true }]} />;
}

export function InviteActions({
  inviteId,
  inviteUrl,
}: {
  inviteId: string;
  inviteUrl: string;
}) {
  const router = useRouter();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Invite link copied');
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  async function revoke() {
    if (!confirm('Revoke this invite? The link will stop working immediately.')) return;
    const res = await fetch(`/api/invites/${inviteId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Revoke failed');
      return;
    }
    toast.success('Invite revoked');
    router.refresh();
  }

  return (
    <RowActions
      items={[
        { label: 'Copy invite link', onSelect: copyLink },
        { label: 'Revoke invite', onSelect: revoke, destructive: true },
      ]}
    />
  );
}

export function PortalUserActions({
  clientId,
  userId,
  name,
}: {
  clientId: string;
  userId: string;
  name: string;
}) {
  const router = useRouter();

  async function remove() {
    if (!confirm(`Remove ${name}'s portal access for this client?`)) return;
    const res = await fetch(`/api/clients/${clientId}/portal-users/${userId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('Remove failed');
      return;
    }
    toast.success('Portal access removed');
    router.refresh();
  }

  return <RowActions items={[{ label: 'Remove portal access', onSelect: remove, destructive: true }]} />;
}

export const PrimaryStar = () => (
  <Star size={11} className="fill-amber-300 text-amber-300" aria-label="Primary contact" />
);

export const PendingDot = () => (
  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
);
