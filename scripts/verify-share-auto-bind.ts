/**
 * End-to-end verifier for the PRD 02-05 share-link auth flow.
 *
 * Spins up a throwaway admin user matching the calendar share link's
 * agency, signs in via the share-page login endpoint, then GETs the
 * identity endpoint with the same cookie jar to confirm the session
 * resolves as `auto_bound` with role=admin. Cleans up the user before
 * exit.
 *
 * Usage:
 *   npx tsx scripts/verify-share-auto-bind.ts <token> [origin]
 */
import { createClient } from '@supabase/supabase-js';

const TOKEN = process.argv[2];
const ORIGIN = process.argv[3] ?? 'http://localhost:3001';

if (!TOKEN) {
  console.error('Usage: tsx scripts/verify-share-auto-bind.ts <token> [origin]');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}
const steps: Step[] = [];

function record(name: string, ok: boolean, detail?: string) {
  steps.push({ name, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` :: ${detail}` : ''}`);
}

async function main() {
  // 1. Resolve the share link's agency + org so the test user matches.
  const { data: link, error: linkErr } = await admin
    .from('content_drop_share_links')
    .select('id, clients(id, agency, organization_id)')
    .eq('token', TOKEN)
    .maybeSingle<{
      id: string;
      clients: { id: string; agency: string | null; organization_id: string | null } | null;
    }>();
  if (linkErr || !link?.clients) {
    record('resolve share link', false, linkErr?.message ?? 'no link/client');
    process.exit(1);
  }
  const agency = link.clients.agency;
  const orgId = link.clients.organization_id;
  record('resolve share link', true, `agency=${agency} org=${orgId}`);

  if (!agency || !orgId) {
    console.error('Share link is missing agency or organization_id; cannot run admin-match test.');
    process.exit(1);
  }

  // 2. The identity resolver matches admins by joining
  //    organizations(name, type) and treating `name` as the agency
  //    string when `type='agency'`. So we need an agency org named
  //    exactly the same as the share link's agency string. Find or
  //    create it; viewers don't go through this branch.
  const { data: agencyOrg } = await admin
    .from('organizations')
    .select('id, name, type')
    .eq('type', 'agency')
    .eq('name', agency)
    .maybeSingle<{ id: string; name: string; type: string }>();
  if (!agencyOrg) {
    record('lookup agency org', false, `no agency org named "${agency}"`);
    process.exit(1);
  }
  const adminOrgId = agencyOrg.id;
  record('lookup agency org', true, `agency_org_id=${adminOrgId}`);

  // 3. Create a throwaway admin user in that org. Email random so reruns
  //    don't collide.
  const stamp = Date.now();
  const email = `share-verify-${stamp}@nativz.test`;
  const password = `pw-${stamp}-${Math.random().toString(36).slice(2, 10)}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    record('create auth user', false, createErr?.message ?? 'no user');
    process.exit(1);
  }
  const userId = created.user.id;
  record('create auth user', true, userId);

  let cleanup = async () => {
    await admin.from('users').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  };

  try {
    // 4. Mirror into public.users with admin role pointed at the agency
    //    org (so the resolver pulls type='agency' + name=<agency>).
    const { error: profileErr } = await admin.from('users').insert({
      id: userId,
      email,
      full_name: 'Share Verify Bot',
      role: 'admin',
      organization_id: adminOrgId,
    });
    if (profileErr) {
      record('insert profile row', false, profileErr.message);
      throw new Error('profile insert failed');
    }
    record('insert profile row', true);

    // 5. POST to share login endpoint with a cookie jar via Headers.
    const loginUrl = `${ORIGIN}/api/share/${TOKEN}/auth/login`;
    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'password', email, password }),
    });
    const setCookies = loginRes.headers.getSetCookie?.() ?? [];
    const loginBody = await loginRes.json().catch(() => ({}));
    record(
      'POST share login',
      loginRes.ok && loginBody?.ok === true,
      `status=${loginRes.status} cookies=${setCookies.length} role=${loginBody?.identity?.role ?? '<none>'}`,
    );
    if (!loginRes.ok) {
      console.log('  body:', JSON.stringify(loginBody));
      throw new Error('login failed');
    }
    if (!setCookies.length) {
      throw new Error('login response set zero cookies');
    }

    // 6. Reuse the cookies for the identity GET. Convert Set-Cookie
    //    headers into a Cookie header so we don't need a real jar.
    const cookieHeader = setCookies
      .map((c) => c.split(';')[0])
      .join('; ');

    const identityRes = await fetch(`${ORIGIN}/api/share/${TOKEN}/identity`, {
      headers: { cookie: cookieHeader },
    });
    const identityBody = (await identityRes.json().catch(() => ({}))) as {
      state?: string;
      identity?: { role?: string; displayName?: string };
    };
    const ok =
      identityRes.ok &&
      identityBody.state === 'auto_bound' &&
      identityBody.identity?.role === 'admin';
    record(
      'GET share identity (auto_bound)',
      ok,
      `status=${identityRes.status} state=${identityBody.state} role=${identityBody.identity?.role ?? '<none>'} name=${identityBody.identity?.displayName ?? '<none>'}`,
    );

    // 7. Also verify the comment POST path stamps author_role=admin
    //    (PRD 05). Hit the create-comment route on a real post if we can
    //    find one in the share link's `included_post_ids` array.
    const { data: linkPosts } = await admin
      .from('content_drop_share_links')
      .select('included_post_ids')
      .eq('token', TOKEN)
      .maybeSingle<{ included_post_ids: string[] | null }>();
    const postId = linkPosts?.included_post_ids?.[0] ?? null;
    const post = postId ? { id: postId } : null;
    if (post?.id) {
      const commentRes = await fetch(
        `${ORIGIN}/api/calendar/share/${TOKEN}/comment`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: cookieHeader },
          body: JSON.stringify({
            postId: post.id,
            status: 'comment',
            content: '[verify-share-auto-bind] admin author role stamp test',
            authorName: 'Share Verify Bot',
            // intentionally pass a forged role to confirm the server
            // ignores client-supplied author_role (PRD 05 contract)
            authorRole: 'guest',
          }),
        },
      );
      const commentBody = await commentRes.json().catch(() => ({}));
      const commentId =
        commentBody?.comment?.id ?? commentBody?.id ?? null;
      if (commentId) {
        const { data: row } = await admin
          .from('post_review_comments')
          .select('author_role, kind, author_user_id')
          .eq('id', commentId)
          .maybeSingle<{
            author_role: string | null;
            kind: string | null;
            author_user_id: string | null;
          }>();
        const stamped =
          row?.author_role === 'admin' &&
          row?.author_user_id === userId &&
          row?.kind === 'admin_response';
        record(
          'POST comment stamps admin role',
          !!stamped,
          `author_role=${row?.author_role} author_user_id=${row?.author_user_id === userId ? 'match' : 'mismatch'} kind=${row?.kind}`,
        );
        // Clean up the test comment.
        await admin.from('post_review_comments').delete().eq('id', commentId);
      } else {
        record(
          'POST comment stamps admin role',
          false,
          `status=${commentRes.status} body=${JSON.stringify(commentBody).slice(0, 160)}`,
        );
      }
    } else {
      record('POST comment stamps admin role', false, 'no post available in drop');
    }
  } finally {
    await cleanup();
  }

  // 8. Wrong-agency rejection: stand up a sibling agency org + admin,
  //    attempt login against the same share link, expect 403 wrong_agency
  //    AND an audit row stamped with the rejected user.
  const otherAgencyName = `verify-other-${Date.now()}`;
  const { data: otherOrg, error: otherOrgErr } = await admin
    .from('organizations')
    .insert({
      name: otherAgencyName,
      slug: otherAgencyName,
      type: 'agency',
      primary_color: '#000000',
    })
    .select('id')
    .single<{ id: string }>();
  if (otherOrgErr || !otherOrg) {
    record('create sibling agency org', false, otherOrgErr?.message ?? 'no row');
  } else {
    record('create sibling agency org', true, otherOrg.id);

    const otherEmail = `share-verify-other-${Date.now()}@nativz.test`;
    const otherPw = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { data: otherCreated } = await admin.auth.admin.createUser({
      email: otherEmail,
      password: otherPw,
      email_confirm: true,
    });
    const otherUserId = otherCreated?.user?.id ?? null;
    if (!otherUserId) {
      record('create sibling admin', false, 'auth.admin.createUser returned no user');
    } else {
      await admin.from('users').insert({
        id: otherUserId,
        email: otherEmail,
        full_name: 'Sibling Verify Bot',
        role: 'admin',
        organization_id: otherOrg.id,
      });
      record('create sibling admin', true, otherUserId);

      const wrongRes = await fetch(`${ORIGIN}/api/share/${TOKEN}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'password', email: otherEmail, password: otherPw }),
      });
      const wrongBody = await wrongRes.json().catch(() => ({}));
      const wrongStatusOk = wrongRes.status === 403 && wrongBody?.error === 'wrong_agency';
      record(
        'POST login rejects wrong agency',
        wrongStatusOk,
        `status=${wrongRes.status} error=${wrongBody?.error}`,
      );

      // The route signs the user back out before returning, so any
      // Set-Cookie should clear the supabase auth cookie. Spot-check
      // that no live session is left behind.
      const wrongCookies = wrongRes.headers.getSetCookie?.() ?? [];
      const stillLoggedIn = wrongCookies.some(
        (c) => c.startsWith('sb-') && !c.includes('Max-Age=0'),
      );
      record(
        'wrong-agency response signs back out',
        !stillLoggedIn,
        `set-cookie count=${wrongCookies.length}`,
      );

      // Audit row: action=auth.login.failed, reason=wrong_agency, actor=otherUserId
      const { data: audit } = await admin
        .from('share_link_admin_actions')
        .select('id, action, actor_user_id, payload')
        .eq('actor_user_id', otherUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{
          id: string;
          action: string;
          actor_user_id: string;
          payload: Record<string, unknown> | null;
        }>();
      const auditOk =
        audit?.action === 'auth.login.failed' &&
        (audit?.payload as { reason?: string } | null)?.reason === 'wrong_agency';
      record(
        'wrong-agency writes audit row',
        !!auditOk,
        `action=${audit?.action} reason=${(audit?.payload as { reason?: string } | null)?.reason}`,
      );

      // Cleanup sibling. Audit-row delete is best-effort (an org-wide
      // policy may block it; that's the auto-mode "audit tampering"
      // guard, not a real failure for this verifier).
      if (audit?.id) {
        try {
          await admin.from('share_link_admin_actions').delete().eq('id', audit.id);
        } catch {
          /* policy may forbid audit deletes */
        }
      }
      await admin.from('users').delete().eq('id', otherUserId);
      await admin.auth.admin.deleteUser(otherUserId);
    }
    await admin.from('organizations').delete().eq('id', otherOrg.id);
  }

  // 9. Editing surface: confirm the editing share link resolves through
  //    the same identity pipeline. Anonymous GET should return 'gateway'
  //    state with shareKind='editing'.
  const { data: editingLink } = await admin
    .from('editing_project_share_links')
    .select('token, archived_at, expires_at')
    .is('archived_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle<{ token: string }>();
  if (editingLink?.token) {
    const editRes = await fetch(`${ORIGIN}/api/share/${editingLink.token}/identity`);
    const editBody = (await editRes.json().catch(() => ({}))) as {
      state?: string;
      shareKind?: string;
    };
    record(
      'editing share resolves',
      editRes.ok && editBody.state === 'gateway' && editBody.shareKind === 'editing',
      `status=${editRes.status} state=${editBody.state} shareKind=${editBody.shareKind}`,
    );
  } else {
    record('editing share resolves', false, 'no live editing share link found');
  }

  const failed = steps.filter((s) => !s.ok);
  console.log('\n=== SUMMARY ===');
  console.log(`${steps.length - failed.length}/${steps.length} passed.`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail ?? '<no detail>'}`));
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
