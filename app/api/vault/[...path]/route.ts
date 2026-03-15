import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readFile, writeFile, listFiles, isVaultConfigured } from '@/lib/vault/github';

/**
 * GET /api/vault/[...path]
 *
 * Read a file or list a directory from the GitHub-backed Obsidian vault.
 * Paths with no file extension or ending in '/' are treated as directory
 * listings; all other paths return the file content and SHA.
 *
 * @auth Required (any authenticated user)
 * @param path - Catch-all path segments joined as the vault path
 * @returns Directory: { files: VaultFile[] } | File: { content: string, sha: string }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    // Auth check — admin only
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isVaultConfigured()) {
      return NextResponse.json({ error: 'Vault not configured' }, { status: 503 });
    }

    const { path } = await params;
    const fullPath = path.join('/');

    // If path ends with / or has no extension, treat as directory listing
    const isDir = !fullPath.includes('.') || fullPath.endsWith('/');

    if (isDir) {
      const files = await listFiles(fullPath.replace(/\/$/, ''));
      return NextResponse.json({ files });
    }

    const file = await readFile(fullPath);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ content: file.content, sha: file.sha });
  } catch (error) {
    console.error('GET /api/vault error:', error);
    return NextResponse.json({ error: 'Failed to read vault' }, { status: 500 });
  }
}

/**
 * PUT /api/vault/[...path]
 *
 * Write (create or update) a file in the GitHub-backed Obsidian vault.
 *
 * @auth Required (any authenticated user)
 * @param path - Catch-all path segments joined as the vault path
 * @body content - File content string (required)
 * @body message - Git commit message (optional, defaults to "update <path>")
 * @returns {{ success: true, sha: string }}
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    // Auth check — admin only
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isVaultConfigured()) {
      return NextResponse.json({ error: 'Vault not configured' }, { status: 503 });
    }

    const { path } = await params;
    const fullPath = path.join('/');
    const body = await request.json();
    const { content, message } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const result = await writeFile(
      fullPath,
      content,
      message || `update ${fullPath}`,
    );

    return NextResponse.json({ success: true, sha: result.sha });
  } catch (error) {
    console.error('PUT /api/vault error:', error);
    return NextResponse.json({ error: 'Failed to write vault' }, { status: 500 });
  }
}
