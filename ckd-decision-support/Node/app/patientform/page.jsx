// app/patientform/page.jsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import Sidebar from '@/components/layout/Sidebar';
import MobileSidebar from '@/components/layout/MobileSidebar';
import CKDForm from '@/components/ckd/CKDForm';
import AIOutput from '@/components/ckd/AIOutput';
import VisitHistory from '@/components/ckd/VisitHistory';
import useProtocols from '@/hooks/useProtocols';
import useVisitHistory from '@/hooks/useVisitHistory';
import useAIRecommendation from '@/hooks/useAIRecommendation';
import useCKDStage from '@/hooks/useCKDStage';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';

export default function CKDPage() {
  const { toast } = useToast();

  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  //const [theme, setTheme] = useState('light');

  // App state
  const [form, setForm] = useState({
    level_of_facility: '',
    age: '',
    egfr: '',
    diabetes: false,
    hypertension: false,
    protocol_id: null,
    patient_identifier: '',
  });

  const [aiOutput, setAiOutput] = useState(null);
  const [chatIds, setChatIds] = useState([]);
  const [token, setToken] = useState(null);

  // hooks
  const { protocols } = useProtocols();
  const { visitHistory, showHistory, historyLoading, fetchVisitHistory, setShowHistory } = useVisitHistory();
  const { loading: aiLoading, saving: aiSaving, handleEvaluate, saveRecord } = useAIRecommendation();
  const { determineStage } = useCKDStage();

  // session token load
useEffect(() => {
  (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;

      setToken(accessToken);

      // If NOT logged in → redirect to /login
      if (!accessToken) {
        window.location.href = "/login";
      }
    } catch (err) {
      console.error("Failed to load token:", err);
    }
  })();
}, []);


  // theme
  const [theme, setTheme] = useState(() =>
  typeof window !== 'undefined'
    ? localStorage.getItem('theme') || 'light'
    : 'light'
);

useEffect(() => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}, [theme]);


  // basic handlers
  const updateField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onEvaluate = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!token) {
        toast({ title: 'Not signed in', description: 'Please sign in to continue.', variant: 'destructive' });
        return;
      }
      const res = await handleEvaluate({ form, token, toast });
      if (res.success) setAiOutput(res.aiOutput);
    },
    [form, handleEvaluate, token, toast]
  );

  const onSave = useCallback(async () => {
    if (!aiOutput) {
      toast({ title: 'Nothing to save', description: 'Generate an AI recommendation first.' });
      return;
    }
    const res = await saveRecord({ form, aiOutput, chatIds, protocols, toast });
    if (res.success) {
      // reset local state after save
      setAiOutput(null);
      setForm({
        level_of_facility: '',
        age: '',
        egfr: '',
        diabetes: false,
        hypertension: false,
        protocol_id: null,
        patient_identifier: '',
      });
      setChatIds([]);
    }
  }, [aiOutput, chatIds, form, protocols, saveRecord, toast]);

  const onFetchHistory = useCallback(async () => {
    await fetchVisitHistory(form.patient_identifier, toast);
  }, [form.patient_identifier, fetchVisitHistory, toast]);

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200 relative">
      <LoadingOverlay show={aiLoading || aiSaving} message={aiLoading ? 'Generating AI Recommendation...' : 'Saving patient record...'} />

      <Sidebar />

      <button
        onClick={() => setIsSidebarOpen(true)}
        className="fixed top-4 left-4 z-40 md:hidden bg-sky-700 text-white rounded-lg px-3 py-2 shadow-lg"
        aria-label="Open menu"
      >
        ☰
      </button>

      <MobileSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 p-6 md:p-8">
        <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow p-6 md:p-8">
          <h1 className="text-2xl font-semibold mb-4">CKD Clinical Decision Support System (AI-assisted)</h1>

          <CKDForm form={form} updateField={updateField} protocols={protocols} onSubmit={onEvaluate} loading={aiLoading} />

          <AIOutput
            aiOutput={aiOutput}
            setAiOutput={setAiOutput}
            token={token}
            form={form}
            onSave={onSave}
            saving={aiSaving}
            setChatIds={setChatIds}
          />
          <VisitHistory form={form} visitHistory={visitHistory} showHistory={showHistory} historyLoading={historyLoading} setShowHistory={setShowHistory} onFetchHistory={onFetchHistory} />
        </div>
      </main>
    </div>
  );
}