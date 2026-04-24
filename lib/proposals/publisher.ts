/**
 * Proposal publisher: clone a template folder from the docs repo into a
 * per-prospect slug folder, customize that folder's client.json with the
 * prospect's details, and commit.
 *
 * The docs repo (nativz-docs or ac-docs) already contains:
 *   - The full branded proposal page (index.html)
 *   - The sign-and-pay page (sign/index.html) that reads client.json at runtime
 *   - Cloudflare Pages Functions for sign/PDF/Stripe/emails
 *
 * Cortex's job is to:
 *   1. Copy an existing template folder into a unique per-prospect folder.
 *   2. Rewrite the new folder's client.json so the slug/proposalUrl match
 *      and the autofill pill pre-fills the prospect's entity + address.
 *   3. Commit + return the final public URL.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { copyFolder, listDir, pathExists, publicUrl, readFile, writeFile } from './docs-repo';
import { randomSuffix, slugify } from './slug';

export type ProposalTemplateRow = {
  id: string;
  agency: 'anderson' | 'nativz';
  name: string;
  source_repo: string;
  source_folder: string;
  public_base_url: string;
};

export type PublishInput = {
  proposalId: string;
  template: ProposalTemplateRow;
  signer: {
    name: string;
    email: string;
    title?: string | null;
  };
  client?: {
    legalName?: string | null;
    tradeName?: string | null;
    address?: string | null;
    domain?: string | null;
  };
  slugHint?: string | null;
};

export type PublishResult = {
  ok: true;
  repo: string;
  folder: string;
  url: string;
  filesWritten: number;
};

export type PublishError = { ok: false; error: string };

function buildFolderSlug(template: ProposalTemplateRow, hint: string | null | undefined): string {
  const base = slugify(hint ?? '');
  const suffix = randomSuffix(6);
  const topic = template.source_folder.replace(/-packages$/, '');
  return base ? `${topic}-${base}-${suffix}` : `${topic}-${suffix}`;
}

async function buildCustomizedClientJson(
  input: PublishInput,
  destFolder: string,
): Promise<string> {
  const templateClient = await readFile(
    input.template.source_repo,
    `${input.template.source_folder}/client.json`,
  );
  if (!templateClient) {
    throw new Error(
      `Template ${input.template.source_repo}/${input.template.source_folder} has no client.json to customize.`,
    );
  }
  if (templateClient.isBinary) {
    throw new Error(
      `Template client.json in ${input.template.source_folder} is not UTF-8 text.`,
    );
  }
  let base: Record<string, unknown>;
  try {
    base = JSON.parse(templateClient.content) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Template client.json in ${input.template.source_folder} is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const proposalUrl = publicUrl(input.template.public_base_url, destFolder);

  const overrides: Record<string, unknown> = {
    slug: destFolder,
    proposalUrl,
  };
  if (input.client?.legalName) overrides.clientLegalName = input.client.legalName;
  if (input.client?.tradeName) overrides.clientName = input.client.tradeName;
  if (input.client?.address) overrides.clientAddress = input.client.address;
  if (input.client?.domain) overrides.domain = input.client.domain;
  overrides.source = {
    ...(typeof base.source === 'object' && base.source ? base.source : {}),
    generator: 'cortex',
    generatedFromFolder: input.template.source_folder,
    generatedAt: new Date().toISOString(),
    cortexProposalId: input.proposalId,
  };

  const merged = { ...base, ...overrides };
  return JSON.stringify(merged, null, 2) + '\n';
}

export async function publishProposal(input: PublishInput): Promise<PublishResult | PublishError> {
  const { template } = input;

  const srcItems = await listDir(template.source_repo, template.source_folder);
  if (srcItems.length === 0) {
    return {
      ok: false,
      error: `Template folder ${template.source_repo}/${template.source_folder} is empty or missing.`,
    };
  }

  let destFolder = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = buildFolderSlug(template, input.slugHint ?? input.signer.name);
    if (!(await pathExists(template.source_repo, candidate))) {
      destFolder = candidate;
      break;
    }
  }
  if (!destFolder) {
    return { ok: false, error: 'Could not allocate a unique proposal folder slug after 5 tries.' };
  }

  const message = `chore(proposals): generate ${destFolder} from ${template.source_folder} (cortex ${input.proposalId})`;
  const { filesWritten } = await copyFolder(
    template.source_repo,
    template.source_folder,
    destFolder,
    message,
    { only: (rel) => rel !== 'client.json' },
  );

  const clientJson = await buildCustomizedClientJson(input, destFolder);
  await writeFile(template.source_repo, `${destFolder}/client.json`, clientJson, message);

  return {
    ok: true,
    repo: template.source_repo,
    folder: destFolder,
    url: publicUrl(template.public_base_url, destFolder),
    filesWritten: filesWritten + 1,
  };
}

export async function savePublishedProposal(
  admin: SupabaseClient,
  proposalId: string,
  result: PublishResult,
  agency: 'anderson' | 'nativz',
): Promise<void> {
  const { error } = await admin
    .from('proposals')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      external_repo: result.repo,
      external_folder: result.folder,
      external_url: result.url,
      agency,
    })
    .eq('id', proposalId);
  if (error) throw new Error(`Failed to persist publish result: ${error.message}`);
}
