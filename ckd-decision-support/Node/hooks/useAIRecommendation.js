// hooks/useAIRecommendation.js
'use client';

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * useAIRecommendation
 * - encapsulates handleEvaluate (AI request) and handleSave (persist visit)
 * - returns state + helper functions
 *
 * Note: the hook uses fetch('/api/ai-recommendation') for the AI call (your API route).
 */
export default function useAIRecommendation() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // simple stage helper kept here for convenience (you also have useCKDStage hook)
  const determineStage = useCallback((egfrNum) => {
    const n = Number(egfrNum);
    if (Number.isNaN(n)) return 'Unknown';
    if (n >= 90) return 'Stage 1 (Normal or high)';
    if (n >= 60) return 'Stage 2 (Mildly decreased)';
    if (n >= 45) return 'Stage 3a (Mildly to moderately decreased)';
    if (n >= 30) return 'Stage 3b (Moderately to severely decreased)';
    if (n >= 15) return 'Stage 4 (Severely decreased)';
    return 'Stage 5 (Kidney Failure)';
  }, []);

  /**
   * handleEvaluate
   * - calls /api/ai-recommendation
   * - requires a valid supabase session token (the caller should pass it)
   */
  const handleEvaluate = useCallback(
    async ({ form, token, toast }) => {
      setLoading(true);
      try {
        const ageNum = Number(form.age);
        const egfrNum = Number(form.egfr);
        const ckdStage = determineStage(egfrNum);

        const res = await fetch('/api/ai-recommendation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            level_of_facility: form.level_of_facility,
            age: ageNum,
            egfr: egfrNum,
            diabetes: form.diabetes,
            hypertension: form.hypertension,
            stage: ckdStage,
            protocol_id: form.protocol_id ?? null,
            patient_identifier: form.patient_identifier || null,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || `Server error (${res.status})`);
        }

        const payload = await res.json();
        const data = payload?.data ?? payload;

        const aiOutput = {
          recommendation: data.recommendation
            ? `CKD ${ckdStage}: ${data.recommendation}`
            : `CKD ${ckdStage}: No specific recommendation provided.`,
          suggested_investigations: Array.isArray(data.suggested_investigations)
            ? data.suggested_investigations.join('\n')
            : data.suggested_investigations ?? '',
          suggested_treatment: Array.isArray(data.suggested_treatment)
            ? data.suggested_treatment.join('\n')
            : data.suggested_treatment ?? '',
          rationale: data.rationale ? `(${ckdStage}) ${data.rationale}` : `(${ckdStage}) No rationale provided.`,
          retrieved_sections: data.retrieved_sections || [],
          citations_summary: data.citations_summary || [],
        };

        toast?.({ title: 'Evaluation complete', description: 'AI recommendation ready.' });
        return { success: true, aiOutput };
      } catch (err) {
        toast?.({
          title: 'Evaluation error',
          description: err.message || 'Could not generate AI recommendation',
          variant: 'destructive',
        });
        return { success: false, error: err };
      } finally {
        setLoading(false);
      }
    },
    [determineStage]
  );

  /**
   * saveRecord
   * - takes form, aiOutput, chatIds, protocols
   * - inserts into supabase patients table
   */
  const saveRecord = useCallback(
    async ({ form, aiOutput, chatIds = [], protocols = [], toast }) => {
      if (saving) return { success: false, error: new Error('Already saving') };
      setSaving(true);
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user) throw new Error('Invalid or expired session.');
        const clinicianId = userData.user.id;

        // Count previous visits
        let visitNumber = 1;
        if (form.patient_identifier) {
          const { count, error: countErr } = await supabase
            .from('patients')
            .select('id', { count: 'exact', head: true })
            .eq('patient_identifier', form.patient_identifier);
          if (!countErr && typeof count === 'number') visitNumber = count + 1;
        }

        const payload = {
          clinician_id: clinicianId,
          patient_identifier: form.patient_identifier,
          visit_number: visitNumber,
          visit_date: new Date().toISOString(),
          age: Number(form.age),
          egfr: Number(form.egfr),
          level_of_facility: form.level_of_facility,
          diabetes: form.diabetes,
          hypertension: form.hypertension,
          ckd_stage: determineStage(Number(form.egfr)),
          recommendation: aiOutput?.recommendation,
          suggested_investigations: aiOutput?.suggested_investigations,
          suggested_treatment: aiOutput?.suggested_treatment,
          ai_explanation: aiOutput?.rationale,
          protocol_used_id: form.protocol_id ?? null,
          linked_chat_logs: chatIds?.length ? chatIds : null,
          protocol_used:
            protocols.find((p) => String(p.id) === String(form.protocol_id))?.name ?? null,
          protocol_evidence:
            aiOutput?.retrieved_sections?.length
              ? aiOutput.retrieved_sections.map((r, i) => ({
                  section_title: r.section_title || `Section ${i + 1}`,
                  page_number: r.page_number ?? null,
                }))
              : aiOutput?.citations_summary?.map((c, i) => ({
                  section_title: c,
                  page_number: null,
                })) || null,
        };

        const { data, error } = await supabase.from('patients').insert([payload]).select('*');
        if (error) throw error;

        toast?.({
          title: `Visit #${visitNumber} saved`,
          description: `Patient record (${form.patient_identifier}) stored successfully.`,
        });

        return { success: true, data };
      } catch (err) {
        const detailedError =
          err?.message ||
          err?.error_description ||
          err?.hint ||
          (typeof err === 'object' ? JSON.stringify(err, null, 2) : String(err));
        toast?.({ title: 'Save error', description: detailedError, variant: 'destructive' });
        return { success: false, error: err };
      } finally {
        setSaving(false);
      }
    },
    [determineStage, saving]
  );

  return {
    loading,
    saving,
    handleEvaluate,
    saveRecord,
    determineStage,
  };
}