import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

/*
  This route handles POST requests from the CKD decision-support UI.
  It:
  - Verifies the clinician via Supabase access token
  - Fetches the Ghana CKD protocol summary from Supabase
  - Builds a structured clinical prompt for OpenAI
  - Returns AI-generated recommendations in structured JSON
*/

// 1. Initialize Supabase server client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req) {
  try {
    // --- Read and validate the Authorization token ---
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Verify clinician
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid or expired session token' }, { status: 401 });
    }

    // Fetch clinician profile to confirm role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,full_name')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'clinician') {
      return NextResponse.json({ error: 'Access denied. Only clinicians can request recommendations.' }, { status: 403 });
    }

    // --- Parse request body ---
    const body = await req.json();
    const { age, egfr, diabetes, hypertension, stage, protocol_id, patient_identifier } = body;

    // --- Fetch Ghana CKD protocol summary (or chosen protocol) ---
    let protocolSummary = '';
    if (protocol_id) {
      const { data: protocol, error } = await supabase
        .from('protocols')
        .select('name, content')
        .eq('id', protocol_id)
        .single();
      if (!error && protocol) protocolSummary = protocol.content || '';
    } else {
      // fallback: Ghana CKD protocol (active)
      const { data: protocol } = await supabase
        .from('protocols')
        .select('content')
        .eq('is_active', true)
        .limit(1)
        .single();
      protocolSummary = protocol?.content || '';
    }

    // --- Construct structured prompt for the LLM ---
    const prompt = `
You are a clinical decision-support assistant trained on CKD (Chronic Kidney Disease) management guidelines.
Use the following local Ghana CKD protocol summary as reference:

"${protocolSummary}"

Patient context:
- Age: ${age}
- eGFR: ${egfr}
- CKD Stage: ${stage}
- Diabetes: ${diabetes ? 'Yes' : 'No'}
- Hypertension: ${hypertension ? 'Yes' : 'No'}

Based on the above, generate a concise recommendation following the Ghana CKD guidelines.
Respond in JSON format only, with the following structure:
{
  "recommendation": "short text summary",
  "suggested_investigations": ["list of tests"],
  "suggested_treatment": ["list of treatments or medications"],
  "rationale": "short reasoning paragraph"
}
`;

    // --- Call OpenAI ---
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a medical AI assistant providing guideline-based CKD management recommendations.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    });

    const content = completion.choices[0]?.message?.content?.trim();

    // --- Parse response ---
    let aiData = {};
    try {
      aiData = JSON.parse(content);
    } catch {
      // fallback if model returned text with extra notes
      aiData = { recommendation: content };
    }

    // --- Save AI query log (for traceability) ---
    await supabase.from('ai_queries').insert([
      {
        user_id: user.id,
        query_text: prompt,
        response: content,
        citations: [protocol_id || 'default-ghana-protocol']
      }
    ]);

    // --- Return structured result ---
    return NextResponse.json({
      success: true,
      data: aiData,
      clinician: profile.full_name,
      patient_identifier
    });
  } catch (err) {
    console.error('AI route error', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}