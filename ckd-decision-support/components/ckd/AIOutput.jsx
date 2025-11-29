// components/ckd/AIOutput.jsx
'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import EvidenceList from './EvidenceList';
import ClarificationChat from '@/components/ClarificationChat';
import { Button } from '@/components/ui/button';

export default function AIOutput({
  aiOutput,
  setAiOutput,
  token,
  form,
  onSave,
  saving,
  setChatIds,
}) {
  return (
    <>
      {aiOutput && (
        <section className="mt-8 border-t pt-6 dark:border-gray-700 space-y-6">
          {/* Recommendation */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
              📘 AI Recommendation
            </label>
            <Textarea
              rows={3}
              value={aiOutput.recommendation}
              onChange={(e) =>
                setAiOutput((prev) => ({ ...prev, recommendation: e.target.value }))
              }
            />
            <EvidenceList sections={aiOutput.retrieved_sections} />
          </div>

          {/* Suggested Investigations */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
              🧾 Suggested Investigations
            </label>
            <Textarea
              rows={3}
              value={aiOutput.suggested_investigations}
              onChange={(e) => setAiOutput((prev) => ({ ...prev, suggested_investigations: e.target.value }))}
            />
            <EvidenceList sections={aiOutput.retrieved_sections} />
          </div>

          {/* Suggested Treatment */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
              💊 Suggested Treatment
            </label>
            <Textarea
              rows={3}
              value={aiOutput.suggested_treatment}
              onChange={(e) => setAiOutput((prev) => ({ ...prev, suggested_treatment: e.target.value }))}
            />
            <EvidenceList sections={aiOutput.retrieved_sections} />
          </div>

          {/* Rationale */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
              📄 Rationale / Explanation
            </label>
            <Textarea
              rows={3}
              value={aiOutput.rationale}
              onChange={(e) => setAiOutput((prev) => ({ ...prev, rationale: e.target.value }))}
            />
            <EvidenceList sections={aiOutput.retrieved_sections} />
          </div>

          {/* Clarification Chat */}
          {token && (
            <>
              <h3 className="text-lg font-semibold mt-8 text-gray-800 dark:text-gray-100">
                Need AI Clarification Before Saving?
              </h3>
              <ClarificationChat
                protocolId={form.protocol_id}
                patientIdentifier={form.patient_identifier}
                token={token}
                onChatSaved={setChatIds}
              />
            </>
          )}

          <div className="flex flex-wrap gap-3 mt-6">
            <Button onClick={() => onSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save Record'}
            </Button>
            <Button variant="outline" onClick={() => setAiOutput(null)} type="button">
              Discard
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
