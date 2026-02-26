import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import ReactPDF from '@react-pdf/renderer';
import { BriefPDFDocument } from '@/lib/pdf/brief-template';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.replication_brief) {
      return NextResponse.json({ error: 'No brief generated yet' }, { status: 400 });
    }

    // Fetch client info if available
    let clientName: string | null = null;
    if (item.client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('name')
        .eq('id', item.client_id)
        .single();
      clientName = client?.name ?? null;
    }

    const pdfStream = await ReactPDF.renderToStream(
      BriefPDFDocument({
        title: item.title || 'Untitled Video',
        url: item.url,
        thumbnailUrl: item.thumbnail_url,
        briefContent: item.replication_brief,
        clientName,
        platform: item.platform || 'unknown',
        generatedAt: new Date().toISOString(),
      })
    );

    // Convert readable stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of pdfStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const filename = `brief-${(item.title || 'video').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40)}.pdf`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('GET /api/moodboard/items/[id]/brief/pdf error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
