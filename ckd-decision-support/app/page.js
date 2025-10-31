'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/*
  CKD Decision Support Form (client-side)
  - Loads active protocols
  - Calls serverless API /api/ai-recommendation (server verifies role using access token)
  - Displays editable AI outputs and allows saving to patients table
*/

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [protocols, setProtocols] = useState([]);
  const [form, setForm] = useState({
    age: '',
    egfr: '',
    diabetes: false,
    hypertension: false,
    protocol_id: null,
    patient_identifier: '',
  });
  const [aiOutput, setAiOutput] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load active protocols from Supabase
  useEffect(() => {
    fetchProtocols();
  }, []);

  async function fetchProtocols() {
    const { data, error } = await supabase
      .from('protocols')
      .select('id,name,version,is_active')
      .order('uploaded_at', { ascending: false });

    if (!error) setProtocols(data || []);
  }

  function determineStage(egfrNum) {
    if (egfrNum >= 90) return 'Stage 1';
    if (egfrNum >= 60) return 'Stage 2';
    if (egfrNum >= 45) return 'Stage 3a';
    if (egfrNum >= 30) return 'Stage 3b';
    if (egfrNum >= 15) return 'Stage 4';
    return 'Stage 5';
  }

  // Evaluate: call server AI endpoint
  async function handleEvaluate(e) {
    e?.preventDefault();
    setLoading(true);
    setAiOutput(null);

    const ageNum = Number(form.age);
    const egfrNum = Number(form.egfr);
    const ckdStage = determineStage(egfrNum);

    // DEVELOPMENT: if you want to avoid costs, use a mock response
    if (process.env.NODE_ENV === 'development') {
      // mock data for local dev
      setAiOutput({
        recommendation: `Mock: Manage risk factors, monitor eGFR in 3 months (Stage ${ckdStage}).`,
        suggested_investigations: ['UACR', 'Serum electrolytes', 'Renal ultrasound'],
        suggested_treatment: ['Start ACE inhibitor (if not contraindicated)', 'Salt restriction', 'Return in 3 months'],
        rationale: 'Mock rationale - development mode',
      });
      setLoading(false);
      return;
    }

    // Get Supabase user session (to forward token to server)
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    // If no session (not logged in), attempt to sign-in (dev only)
    if (!accessToken) {
      alert('Please log in first (demo clinician).');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/ai-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`, // Server will verify role
        },
        body: JSON.stringify({
          age: ageNum,
          egfr: egfrNum,
          diabetes: form.diabetes,
          hypertension: form.hypertension,
          stage: ckdStage,
          protocol_id: form.protocol_id, // nullable
          patient_identifier: form.patient_identifier || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'AI API returned an error');
      }

      const payload = await res.json();
      // payload expected: { success: true, data: { recommendation, suggested_investigations, suggested_treatment, rationale } }
      const data = payload.data ?? payload; // flexible
      setAiOutput({
        recommendation: data.recommendation || '',
        suggested_investigations: (data.suggested_investigations || []).join('\n'),
        suggested_treatment: (data.suggested_treatment || []).join('\n'),
        rationale: data.rationale || '',
      });
    } catch (err) {
      console.error(err);
      alert('Failed to get AI recommendation: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  // Save clinician edits to patients table
  async function handleSave() {
    setSaving(true);

    // Try get user info for clinician_id
    const { data: userData } = await supabase.auth.getUser();
    const clinicianId = userData?.user?.id || null;

    const payload = {
      clinician_id: clinicianId,
      patient_identifier: form.patient_identifier || null,
      ckd_stage: determineStage(Number(form.egfr || 0)),
      recommendation: aiOutput?.recommendation || null,
      suggested_investigations: aiOutput?.suggested_investigations || null,
      suggested_treatment: aiOutput?.suggested_treatment || null,
      ai_explanation: aiOutput?.rationale || null,
      protocol_used: protocols.find((p) => p.id === form.protocol_id)?.name || null,
    };

    try {
      const { error } = await supabase.from('patients').insert([payload]);
      if (error) throw error;
      alert('Saved successfully');
      // optional: clear form / aiOutput
      setAiOutput(null);
      setForm({ age: '', egfr: '', diabetes: false, hypertension: false, protocol_id: null, patient_identifier: '' });
    } catch (err) {
      console.error('Save error', err);
      alert('Failed saving: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '32px auto', padding: 16, fontFamily: 'system-ui, Arial' }}>
      <h1>CKD Decision Support (AI-assisted)</h1>

      <form onSubmit={handleEvaluate} style={{ display: 'grid', gap: 8 }}>
        <div>
          <label>Patient identifier (optional)</label><br />
          <input value={form.patient_identifier} onChange={(e) => setForm({ ...form, patient_identifier: e.target.value })} style={{ width: '100%', padding: 8 }} placeholder="e.g., MRN or initials" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label>Age</label><br />
            <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} style={{ width: '100%', padding: 8 }} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>eGFR (mL/min/1.73m²)</label><br />
            <input type="number" value={form.egfr} onChange={(e) => setForm({ ...form, egfr: e.target.value })} style={{ width: '100%', padding: 8 }} required />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label><input type="checkbox" checked={form.diabetes} onChange={(e) => setForm({ ...form, diabetes: e.target.checked })} /> Diabetes</label>
          <label><input type="checkbox" checked={form.hypertension} onChange={(e) => setForm({ ...form, hypertension: e.target.checked })} /> Hypertension</label>
          <div style={{ marginLeft: 'auto' }}>
            <label>Protocol</label><br />
            <select value={form.protocol_id || ''} onChange={(e) => setForm({ ...form, protocol_id: e.target.value || null })} style={{ padding: 8 }}>
              <option value=''>-- Use default --</option>
              {protocols.map((p) => <option key={p.id} value={p.id}>{p.name} {p.version ? `v${p.version}` : ''} {p.is_active ? ' (active)' : ''}</option>)}
            </select>
          </div>
        </div>

        <div>
          <button type="submit" disabled={loading} style={{ padding: '10px 16px' }}>
            {loading ? 'Evaluating...' : 'Evaluate (AI)'}
          </button>
        </div>
      </form>

      {aiOutput && (
        <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <h3>AI Recommendation (editable)</h3>

          <div style={{ marginBottom: 8 }}>
            <label>Recommendation</label><br />
            <textarea rows={3} value={aiOutput.recommendation} onChange={(e) => setAiOutput({ ...aiOutput, recommendation: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label>Suggested Investigations (one per line)</label><br />
            <textarea rows={4} value={aiOutput.suggested_investigations} onChange={(e) => setAiOutput({ ...aiOutput, suggested_investigations: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label>Suggested Treatment (one per line)</label><br />
            <textarea rows={4} value={aiOutput.suggested_treatment} onChange={(e) => setAiOutput({ ...aiOutput, suggested_treatment: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label>Rationale / Explanation (from AI)</label><br />
            <textarea rows={2} value={aiOutput.rationale} onChange={(e) => setAiOutput({ ...aiOutput, rationale: e.target.value })} style={{ width: '100%', padding: 8 }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 14px' }}>{saving ? 'Saving...' : 'Save to record'}</button>
            <button onClick={() => { setAiOutput(null); }} style={{ padding: '8px 14px' }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}