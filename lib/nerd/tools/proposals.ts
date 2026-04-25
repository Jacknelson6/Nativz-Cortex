import { z } from 'zod';
import { randomUUID } from 'crypto';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProposalDraft } from '@/lib/proposals/create';
import {
  persistRecomputedDraft,
  type ServiceLine,
  type CustomBlock,
} from '@/lib/proposals/draft-engine';
import { renderDraftAsTemplateTier } from '@/lib/proposals/draft-render';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const proposalTools: ToolDefinition[] = [
  // ── list_proposal_templates ───────────────────────────────────
  {
    name: 'list_proposal_templates',
    description:
      'List all active proposal templates (e.g. "Content Editing Packages") that can be used to generate a new proposal. Returns id, name, agency, description, and a preview of the tiers with prices. Use before calling create_proposal.',
    parameters: z.object({
      agency: z.enum(['anderson', 'nativz']).optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        let q = supabase
          .from('proposal_templates')
          .select('id, agency, name, description, source_folder, tiers_preview')
          .eq('active', true);
        if (params.agency) q = q.eq('agency', params.agency as string);
        const { data, error } = await q.order('agency').order('name');
        if (error) return { success: false, error: error.message };
        return {
          success: true,
          data: data ?? [],
          cardType: 'text' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list templates',
        };
      }
    },
  },

  // ── create_proposal ──────────────────────────────────────────
  {
    name: 'create_proposal',
    description:
      'Generate a new proposal from a template, save it to Cortex, and email the signer the "Review & sign" link. Use after list_proposal_templates so you have the template_id. The signer name + email are required; legal entity / address pre-fill the autofill pill on the sign page.',
    parameters: z.object({
      template_id: z.string().uuid(),
      signer_name: z.string().min(2).max(200),
      signer_email: z.string().email(),
      signer_title: z.string().max(200).optional(),
      signer_legal_entity: z.string().max(200).optional().describe('Pre-filled into the autofill pill on the sign page'),
      signer_address: z.string().max(300).optional(),
      client_id: z
        .string()
        .uuid()
        .optional()
        .describe('Optional Cortex client id. If provided, lifecycle events are logged on that client.'),
      title: z.string().max(200).optional().describe('Custom title; defaults to "<Template> — <Client>"'),
      send_email: z
        .boolean()
        .optional()
        .default(true)
        .describe('false = create the proposal but do not email (admin will send manually)'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const result = await createProposalDraft({
          templateId: params.template_id as string,
          signerName: params.signer_name as string,
          signerEmail: params.signer_email as string,
          signerTitle: (params.signer_title as string | undefined) ?? null,
          signerLegalEntity: (params.signer_legal_entity as string | undefined) ?? null,
          signerAddress: (params.signer_address as string | undefined) ?? null,
          clientId: (params.client_id as string | undefined) ?? null,
          title: (params.title as string | undefined) ?? null,
          sendEmail: params.send_email !== false,
          createdBy: userId,
        });
        if (!result.ok) return { success: false, error: result.error };
        return {
          success: true,
          data: {
            id: result.proposalId,
            slug: result.slug,
            url: result.url,
            sent: result.sent,
            send_error: result.sendError,
          },
          link: {
            href: `/admin/proposals/${result.slug}`,
            label: 'View proposal',
          },
          cardType: 'text' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create proposal',
        };
      }
    },
  },

  // ── get_proposal ─────────────────────────────────────────────
  {
    name: 'get_proposal',
    description:
      'Look up a proposal by slug or id. Returns status (draft/sent/viewed/signed/paid), signer info, public URL, and timestamps.',
    parameters: z.object({
      proposal: z.string().describe('Slug or UUID'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const key = params.proposal as string;
        const isUuid = UUID_RE.test(key);
        const { data, error } = await supabase
          .from('proposals')
          .select(
            'id, slug, title, status, agency, signer_name, signer_email, external_url, sent_at, viewed_at, signed_at, paid_at, tier_label, total_cents, deposit_cents',
          )
          .eq(isUuid ? 'id' : 'slug', key)
          .maybeSingle();
        if (error) return { success: false, error: error.message };
        if (!data) return { success: false, error: 'Proposal not found' };
        return {
          success: true,
          data,
          link: { href: `/admin/proposals/${data.slug}`, label: 'View proposal' },
          cardType: 'text' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to look up proposal',
        };
      }
    },
  },

  // ── delete_proposal ──────────────────────────────────────────
  {
    name: 'delete_proposal',
    description:
      'Permanently delete a proposal and its signed/executed PDFs. Cannot delete proposals in status "paid" — refund + cancel in Stripe first.',
    parameters: z.object({
      proposal: z.string().describe('Slug or UUID'),
    }),
    riskLevel: 'destructive',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const key = params.proposal as string;
        const isUuid = UUID_RE.test(key);
        const { data: row } = await supabase
          .from('proposals')
          .select('id, slug, status, signed_pdf_path, counter_signed_pdf_path')
          .eq(isUuid ? 'id' : 'slug', key)
          .maybeSingle();
        if (!row) return { success: false, error: 'Proposal not found' };
        if (row.status === 'paid') {
          return {
            success: false,
            error: 'Cannot delete a paid proposal. Refund + cancel in Stripe first.',
          };
        }
        const paths = [row.signed_pdf_path, row.counter_signed_pdf_path].filter(
          (p): p is string => Boolean(p),
        );
        if (paths.length > 0) {
          await supabase.storage
            .from('proposal-pdfs')
            .remove(paths)
            .catch((err) => console.warn('[nerd:delete_proposal] storage remove failed', err));
        }
        const { error } = await supabase.from('proposals').delete().eq('id', row.id);
        if (error) return { success: false, error: error.message };
        return {
          success: true,
          data: { deleted: row.slug },
          cardType: 'text' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete proposal',
        };
      }
    },
  },

  // ── resend_proposal ──────────────────────────────────────────
  {
    name: 'resend_proposal',
    description:
      'Resend the branded "Review & sign" email for an existing proposal. Useful when the signer says they never got the original.',
    parameters: z.object({
      proposal: z.string().describe('Slug or UUID'),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const key = params.proposal as string;
        const isUuid = UUID_RE.test(key);
        const { data: row } = await supabase
          .from('proposals')
          .select('id, slug')
          .eq(isUuid ? 'id' : 'slug', key)
          .maybeSingle();
        if (!row) return { success: false, error: 'Proposal not found' };
        const { sendProposal } = await import('@/lib/proposals/send');
        const result = await sendProposal(row.id, { admin: supabase });
        if (!result.ok) return { success: false, error: result.error };
        return {
          success: true,
          data: { url: result.url, slug: row.slug },
          link: { href: `/admin/proposals/${row.slug}`, label: 'View proposal' },
          cardType: 'text' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to resend proposal',
        };
      }
    },
  },

  // ════════════════════════════════════════════════════════════════
  // Chat-driven builder tools — coexist with the template tools above.
  // Use these when the admin wants a custom proposal composed from the
  // pricing repository rather than a fixed template.
  // ════════════════════════════════════════════════════════════════

  // ── list_proposal_services ────────────────────────────────────
  {
    name: 'list_proposal_services',
    description:
      'List the proposal service catalog for an agency — short-form video, retainers, etc. Each entry has a slug (use it to add lines), name, billing_unit, base price, and included_items. Call before suggesting services to add to a draft.',
    parameters: z.object({
      agency: z.enum(['anderson', 'nativz']),
      category: z.enum(['social', 'paid_media', 'web', 'creative', 'strategy', 'other']).optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        let q = admin
          .from('proposal_services')
          .select('id, slug, name, category, description, billing_unit, base_unit_price_cents, default_quantity, included_items')
          .eq('agency', params.agency as string)
          .eq('active', true);
        if (params.category) q = q.eq('category', params.category as string);
        const { data, error } = await q.order('category').order('name');
        if (error) return { success: false, error: error.message };
        return { success: true, data: data ?? [], cardType: 'text' as const };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },

  // ── create_proposal_draft ─────────────────────────────────────
  {
    name: 'create_proposal_draft',
    description:
      'Start a new proposal draft. Pass agency + (optional) client_id (looked up via tag/lookup tools) and an optional title. Returns the draft id you pass to subsequent add/preview/commit calls. Auto-fills signer fields from the client primary contact if a client is set.',
    parameters: z.object({
      agency: z.enum(['anderson', 'nativz']),
      client_id: z.string().regex(UUID_RE).optional(),
      flow_id: z.string().regex(UUID_RE).optional(),
      title: z.string().max(200).optional(),
      payment_model: z.enum(['one_off', 'subscription']).optional(),
      cadence: z.enum(['week', 'month', 'quarter', 'year']).optional(),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const insert: Record<string, unknown> = {
          agency: params.agency,
          client_id: (params.client_id as string | undefined) ?? null,
          flow_id: (params.flow_id as string | undefined) ?? null,
          title: (params.title as string | undefined) ?? null,
          payment_model: (params.payment_model as string | undefined) ?? 'one_off',
          cadence: (params.cadence as string | undefined) ?? (params.payment_model === 'subscription' ? 'month' : null),
          created_by: userId,
        };
        if (params.client_id) {
          const { data: contact } = await admin
            .from('contacts')
            .select('name, email, title')
            .eq('client_id', params.client_id as string)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (contact) {
            insert.signer_name = contact.name ?? null;
            insert.signer_email = contact.email ?? null;
            insert.signer_title = contact.title ?? null;
          }
          const { data: client } = await admin
            .from('clients')
            .select('name')
            .eq('id', params.client_id as string)
            .maybeSingle();
          if (client) {
            insert.signer_legal_entity = client.name ?? null;
            if (!insert.title) insert.title = `${client.name} — Custom proposal`;
          }
        }
        const { data, error } = await admin
          .from('proposal_drafts')
          .insert(insert)
          .select('*')
          .single();
        if (error || !data) return { success: false, error: error?.message ?? 'insert failed' };
        return {
          success: true,
          data: { draft_id: data.id, status: data.status, title: data.title },
          link: { href: `/admin/proposals/builder?draft=${data.id}`, label: 'Open builder' },
          cardType: 'text' as const,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },

  // ── add_service_line ───────────────────────────────────────────
  {
    name: 'add_service_line',
    description:
      'Add a service line to a draft. Pass either a service_slug (preferred — pulls from the catalog) or a free-form name + unit_price_cents + billing_unit (for one-off custom add-ons). Returns the updated draft totals.',
    parameters: z.object({
      draft_id: z.string().regex(UUID_RE),
      service_slug: z.string().optional(),
      quantity: z.number().int().positive().default(1),
      unit_price_override_cents: z.number().int().nonnegative().optional(),
      // Free-form fields:
      name: z.string().max(200).optional(),
      unit_price_cents: z.number().int().nonnegative().optional(),
      billing_unit: z
        .enum(['per_video', 'per_post', 'per_month', 'per_year', 'per_quarter', 'flat', 'per_hour', 'per_unit'])
        .optional(),
      note: z.string().max(500).optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const { data: draft } = await admin
          .from('proposal_drafts')
          .select('id, agency, service_lines')
          .eq('id', params.draft_id as string)
          .maybeSingle();
        if (!draft) return { success: false, error: 'draft not found' };

        let line: ServiceLine;
        if (params.service_slug) {
          const { data: service } = await admin
            .from('proposal_services')
            .select('id, slug, name, billing_unit, base_unit_price_cents')
            .eq('agency', draft.agency)
            .eq('slug', params.service_slug as string)
            .eq('active', true)
            .maybeSingle();
          if (!service) return { success: false, error: `service "${params.service_slug}" not in catalog` };
          line = {
            id: randomUUID(),
            service_id: service.id as string,
            service_slug_snapshot: service.slug as string,
            name_snapshot: service.name as string,
            quantity: (params.quantity as number) ?? 1,
            unit_price_cents:
              (params.unit_price_override_cents as number | undefined) ?? (service.base_unit_price_cents as number),
            billing_unit_snapshot: service.billing_unit as never,
            applied_rule_ids: [],
            note: params.note as string | undefined,
          };
        } else {
          if (!params.name || params.unit_price_cents === undefined || !params.billing_unit) {
            return { success: false, error: 'free-form line requires name + unit_price_cents + billing_unit' };
          }
          line = {
            id: randomUUID(),
            service_id: null,
            service_slug_snapshot: null,
            name_snapshot: params.name as string,
            quantity: (params.quantity as number) ?? 1,
            unit_price_cents:
              (params.unit_price_override_cents as number | undefined) ?? (params.unit_price_cents as number),
            billing_unit_snapshot: params.billing_unit as never,
            applied_rule_ids: [],
            note: params.note as string | undefined,
          };
        }
        const next = [...((draft.service_lines as ServiceLine[]) ?? []), line];
        await admin.from('proposal_drafts').update({ service_lines: next }).eq('id', draft.id);
        const r = await persistRecomputedDraft(draft.id, admin);
        if (!r.ok) return { success: false, error: r.error };
        return {
          success: true,
          data: { line_id: line.id, total_cents: r.draft.total_cents, deposit_cents: r.draft.deposit_cents },
          cardType: 'text' as const,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },

  // ── update_service_line ────────────────────────────────────────
  {
    name: 'update_service_line',
    description:
      'Mutate or remove a service line on a draft. Pass `remove: true` to delete; otherwise update quantity / unit_price_cents / note. Returns updated totals.',
    parameters: z.object({
      draft_id: z.string().regex(UUID_RE),
      line_id: z.string().regex(UUID_RE),
      remove: z.boolean().optional(),
      quantity: z.number().int().positive().optional(),
      unit_price_cents: z.number().int().nonnegative().optional(),
      note: z.string().max(500).nullable().optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const { data: draft } = await admin
          .from('proposal_drafts')
          .select('id, service_lines')
          .eq('id', params.draft_id as string)
          .maybeSingle();
        if (!draft) return { success: false, error: 'draft not found' };
        let lines = ((draft.service_lines as ServiceLine[]) ?? []);
        if (params.remove) {
          lines = lines.filter((l) => l.id !== (params.line_id as string));
        } else {
          lines = lines.map((l) => {
            if (l.id !== (params.line_id as string)) return l;
            return {
              ...l,
              quantity: (params.quantity as number | undefined) ?? l.quantity,
              unit_price_cents: (params.unit_price_cents as number | undefined) ?? l.unit_price_cents,
              note: params.note === undefined ? l.note : (params.note as string | null) ?? undefined,
            };
          });
        }
        await admin.from('proposal_drafts').update({ service_lines: lines }).eq('id', draft.id);
        const r = await persistRecomputedDraft(draft.id, admin);
        if (!r.ok) return { success: false, error: r.error };
        return {
          success: true,
          data: { total_cents: r.draft.total_cents, deposit_cents: r.draft.deposit_cents },
          cardType: 'text' as const,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },

  // ── update_draft_signer ────────────────────────────────────────
  {
    name: 'update_draft_signer',
    description:
      'Update signer fields on a draft (name, email, title, legal_entity, address). Pass any subset.',
    parameters: z.object({
      draft_id: z.string().regex(UUID_RE),
      signer_name: z.string().max(200).nullable().optional(),
      signer_email: z.string().email().nullable().optional(),
      signer_title: z.string().max(200).nullable().optional(),
      signer_legal_entity: z.string().max(200).nullable().optional(),
      signer_address: z.string().max(300).nullable().optional(),
      title: z.string().max(200).nullable().optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const { draft_id, ...patch } = params as Record<string, unknown>;
        const cleaned = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        );
        const { error } = await admin
          .from('proposal_drafts')
          .update(cleaned)
          .eq('id', draft_id as string);
        if (error) return { success: false, error: error.message };
        return { success: true, data: { ok: true }, cardType: 'text' as const };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },

  // ── set_draft_payment_model ────────────────────────────────────
  {
    name: 'set_draft_payment_model',
    description:
      'Switch a draft between one_off (deposit + balance) and subscription (recurring). Pass cadence (week/month/quarter/year) for subscription. Recomputes totals + deposit since payment model affects the deposit calculation.',
    parameters: z.object({
      draft_id: z.string().regex(UUID_RE),
      payment_model: z.enum(['one_off', 'subscription']),
      cadence: z.enum(['week', 'month', 'quarter', 'year']).optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const { error } = await admin
          .from('proposal_drafts')
          .update({
            payment_model: params.payment_model,
            cadence: params.payment_model === 'subscription' ? (params.cadence ?? 'month') : null,
          })
          .eq('id', params.draft_id as string);
        if (error) return { success: false, error: error.message };
        const r = await persistRecomputedDraft(params.draft_id as string, admin);
        if (!r.ok) return { success: false, error: r.error };
        return {
          success: true,
          data: { total_cents: r.draft.total_cents, deposit_cents: r.draft.deposit_cents },
          cardType: 'text' as const,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },

  // ── add_draft_block ────────────────────────────────────────────
  {
    name: 'add_draft_block',
    description:
      'Add a markdown or image block to a draft. Markdown blocks render between the scope table and signature in the preview. Image blocks need a public URL — the Builder UI uploads dropped images and passes the URL here.',
    parameters: z.object({
      draft_id: z.string().regex(UUID_RE),
      kind: z.enum(['markdown', 'image']),
      content: z.string().min(1).max(20000),
      caption: z.string().max(200).optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const { data: draft } = await admin
          .from('proposal_drafts')
          .select('id, custom_blocks')
          .eq('id', params.draft_id as string)
          .maybeSingle();
        if (!draft) return { success: false, error: 'draft not found' };
        const existing = ((draft.custom_blocks as CustomBlock[]) ?? []);
        const block: CustomBlock = {
          id: randomUUID(),
          kind: params.kind as 'markdown' | 'image',
          content: params.content as string,
          caption: params.caption as string | undefined,
          position: existing.length,
        };
        await admin
          .from('proposal_drafts')
          .update({ custom_blocks: [...existing, block] })
          .eq('id', draft.id);
        return { success: true, data: { block_id: block.id }, cardType: 'text' as const };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },

  // ── preview_draft ──────────────────────────────────────────────
  {
    name: 'preview_draft',
    description:
      'Return the preview URL for a draft. The Builder UI auto-pins this in the right pane, but use this when responding inline to "show me the proposal" so the chat surfaces a clickable link.',
    parameters: z.object({
      draft_id: z.string().regex(UUID_RE),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      const url = `/admin/proposals/draft/${params.draft_id}/preview`;
      return {
        success: true,
        data: { url },
        link: { href: url, label: 'Open preview' },
        cardType: 'text' as const,
      };
    },
  },

  // ── commit_proposal_draft ──────────────────────────────────────
  {
    name: 'commit_proposal_draft',
    description:
      'Finalise a draft: synthesise a transient template, create the canonical proposals row, and (by default) email the signer the Review & Sign link. Returns the public proposal URL.',
    parameters: z.object({
      draft_id: z.string().regex(UUID_RE),
      send_email: z.boolean().optional().default(true),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const { data: draft } = await admin
          .from('proposal_drafts')
          .select('*, clients(name, slug, logo_url)')
          .eq('id', params.draft_id as string)
          .maybeSingle();
        if (!draft) return { success: false, error: 'draft not found' };
        if (draft.status === 'committed' && draft.committed_proposal_id) {
          return {
            success: true,
            data: { already: true, proposal_id: draft.committed_proposal_id },
          };
        }
        if (!draft.signer_name || !draft.signer_email) {
          return { success: false, error: 'set signer name + email before committing' };
        }
        if (!Array.isArray(draft.service_lines) || draft.service_lines.length === 0) {
          return { success: false, error: 'add at least one service line before committing' };
        }
        const synth = await renderDraftAsTemplateTier(draft as never, admin);
        if (!synth.ok) return { success: false, error: synth.error };
        const result = await createProposalDraft(
          {
            templateId: synth.templateId,
            clientId: (draft.client_id as string | null) ?? null,
            flowId: (draft.flow_id as string | null) ?? null,
            title: (draft.title as string | null) ?? undefined,
            signerName: draft.signer_name as string,
            signerEmail: draft.signer_email as string,
            signerTitle: (draft.signer_title as string | null) ?? null,
            signerLegalEntity: (draft.signer_legal_entity as string | null) ?? null,
            signerAddress: (draft.signer_address as string | null) ?? null,
            sendEmail: (params.send_email as boolean | undefined) ?? true,
            createdBy: userId,
          },
          admin,
        );
        if (!result.ok) {
          return { success: false, error: result.error };
        }
        await admin
          .from('proposal_drafts')
          .update({ status: 'committed', committed_proposal_id: result.proposalId })
          .eq('id', draft.id);
        return {
          success: true,
          data: { proposal_id: result.proposalId, slug: result.slug, url: result.url, sent: result.sent },
          link: { href: `/admin/proposals/${result.slug}`, label: 'Open proposal' },
          cardType: 'text' as const,
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed' };
      }
    },
  },
];
