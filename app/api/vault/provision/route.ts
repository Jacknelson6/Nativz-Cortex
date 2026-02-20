/**
 * POST /api/vault/provision
 *
 * Reads all client profiles from the vault and creates Supabase records
 * for any that don't already exist. This bridges vault-only clients into
 * Cortex so they can be used for searches, feature flags, etc.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClients } from '@/lib/vault/reader';

const NATIVZ_ORG_ID = 'a86169ce-f240-47e2-a950-8d01c6bb0727';

export const maxDuration = 60;

export async function POST() {
  try {
    const vaultClients = await getVaultClients();
    if (vaultClients.length === 0) {
      return NextResponse.json({ message: 'No vault clients found' });
    }

    const adminClient = createAdminClient();

    // Get existing slugs
    const { data: existing } = await adminClient
      .from('clients')
      .select('slug');
    const existingSlugs = new Set((existing || []).map((c) => c.slug));

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const vc of vaultClients) {
      if (existingSlugs.has(vc.slug)) {
        // Update existing record with vault data
        const { error } = await adminClient
          .from('clients')
          .update({
            industry: vc.industry || 'General',
            target_audience: vc.target_audience || null,
            brand_voice: vc.brand_voice || null,
            topic_keywords: vc.topic_keywords.length > 0 ? vc.topic_keywords : null,
            website_url: vc.website_url || null,
          })
          .eq('slug', vc.slug);

        if (error) {
          errors.push(`${vc.name}: ${error.message}`);
        } else {
          skipped.push(vc.name);
        }
        continue;
      }

      const { error } = await adminClient
        .from('clients')
        .insert({
          name: vc.name,
          slug: vc.slug,
          industry: vc.industry || 'General',
          organization_id: NATIVZ_ORG_ID,
          target_audience: vc.target_audience || null,
          brand_voice: vc.brand_voice || null,
          topic_keywords: vc.topic_keywords.length > 0 ? vc.topic_keywords : null,
          website_url: vc.website_url || null,
          feature_flags: {
            can_search: true,
            can_view_reports: true,
            can_edit_preferences: false,
            can_submit_ideas: false,
          },
        });

      if (error) {
        errors.push(`${vc.name}: ${error.message}`);
      } else {
        created.push(vc.name);
      }
    }

    return NextResponse.json({
      message: `Provisioned ${created.length} clients, updated ${skipped.length}, ${errors.length} errors`,
      created,
      updated: skipped,
      errors,
    });
  } catch (error) {
    console.error('POST /api/vault/provision error:', error);
    return NextResponse.json({ error: 'Failed to provision' }, { status: 500 });
  }
}
