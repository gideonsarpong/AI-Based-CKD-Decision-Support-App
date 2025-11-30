// hooks/useVisitHistory.js
'use client';

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function useVisitHistory() {
  const [visitHistory, setVisitHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchVisitHistory = useCallback(async (patientIdentifier, toast) => {
    if (!patientIdentifier) {
      toast?.({
        title: 'Missing Patient ID',
        description: 'Please enter a valid patient ID before viewing history.',
        variant: 'destructive',
      });
      return { success: false };
    }

    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select(
          `
          id,
          patient_identifier,
          visit_number,
          visit_date,
          age,
          egfr,
          ckd_stage,
          level_of_facility,
          diabetes,
          hypertension,
          recommendation,
          suggested_investigations,
          suggested_treatment,
          ai_explanation,
          protocol_used,
          created_at,
          protocol_evidence
        `
        )
        .eq('patient_identifier', patientIdentifier)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setVisitHistory([]);
        toast?.({ title: 'No History Found', description: 'No previous visits found for this patient ID.' });
        return { success: true, data: [] };
      }

      setVisitHistory(data);
      setShowHistory(true);
      toast?.({ title: 'Visit History Loaded', description: `${data.length} visit record(s) found.` });
      return { success: true, data };
    } catch (err) {
      toast?.({ title: 'Error Loading History', description: err.message || 'Could not retrieve visit history.', variant: 'destructive' });
      return { success: false, error: err };
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  return { visitHistory, showHistory, historyLoading, fetchVisitHistory, setShowHistory, setVisitHistory };
}