import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';

export async function GET() {
  try {
    const { data, error } = await supabaseServer.from('profiles').select('1').limit(1); // or use a simple query
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      message: 'Supabase connection successful',
      now: new Date().toISOString(),
    });
  } catch (err) {
    console.error('healthcheck error', err);
    return NextResponse.json({ ok: false, error: err.message || 'err' }, { status: 500});
  }
}