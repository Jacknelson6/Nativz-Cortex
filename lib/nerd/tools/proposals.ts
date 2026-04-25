import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProposalDraft } from '@/lib/proposals/create';

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
];
