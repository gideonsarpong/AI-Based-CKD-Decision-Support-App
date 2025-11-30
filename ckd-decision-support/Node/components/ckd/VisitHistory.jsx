// components/ckd/VisitHistory.jsx
'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function VisitHistory({
  form,
  visitHistory,
  showHistory,
  historyLoading,
  setShowHistory,
  onFetchHistory,
}) {
  return (
    <>
      <AnimatePresence>
        {form.patient_identifier?.trim() ? (
          <motion.div
            key="history-button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex justify-end mt-8"
          >
            <Button
              onClick={() => {
              setShowHistory(true);
              onFetchHistory?.();
              }}
              variant="secondary"
              className="bg-sky-700 text-white"
              disabled={historyLoading}
            >
              {historyLoading ? 'Loading…' : 'View Full Visit History'}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <motion.section
            key="visit-history"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="mt-10 border-t pt-6 dark:border-gray-700 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                Visit History for {form.patient_identifier}
              </h3>
              <Button size="sm" variant="outline" onClick={() => setShowHistory(false)}>
                Close
              </Button>
            </div>

            {historyLoading ? (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-gray-500">
                Loading history...
              </motion.p>
            ) : visitHistory.length === 0 ? (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-gray-500">
                No previous visits found.
              </motion.p>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm divide-y divide-gray-200 dark:divide-gray-700"
              >
                {visitHistory.map((v, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                  >
                    <details className="group">
                      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between text-sm font-medium text-gray-800 dark:text-gray-100">
                        <div className="flex flex-col">
                          <span>
                            <strong>Visit #{v.visit_number || i + 1}</strong> —{' '}
                            {v.visit_date ? new Date(v.visit_date).toLocaleDateString() : '—'}
                          </span>
                          <span className="text-xs text-gray-500">
                            eGFR: {v.egfr ?? '—'} | Stage: {v.ckd_stage ?? '—'}
                          </span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>

                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="px-5 pb-4 space-y-4 text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/30 rounded-b-xl">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Recommendation:</p>
                          <p className="whitespace-pre-wrap">{v.recommendation || '—'}</p>

                          {Array.isArray(v.protocol_evidence) && v.protocol_evidence.length > 0 ? (
                            <div className="mt-2 text-xs text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 rounded-md p-2">
                              📘 Citation:
                              {v.protocol_evidence.map((e, idx) => (
                                <span key={idx} className="block">
                                  • {e.section_title || e.title || 'Untitled section'}
                                  {e.page_number != null && e.page_number !== '' ? (
                                    <span className="text-xs text-sky-500"> (p.{e.page_number})</span>
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/30 rounded-md italic">📘 No citations found.</div>
                          )}
                        </div>

                        {/* Suggested Investigations */}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Suggested Investigations:</p>
                          <p className="whitespace-pre-wrap">{v.suggested_investigations || '—'}</p>
                        </div>

                        {/* Suggested Treatment */}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Suggested Treatment:</p>
                          <p className="whitespace-pre-wrap">{v.suggested_treatment || '—'}</p>
                        </div>

                        {/* Rationale */}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Rationale:</p>
                          <p className="whitespace-pre-wrap">{v.ai_explanation || '—'}</p>
                        </div>

                        <div className="text-xs text-gray-500">Protocol: {v.protocol_used || '—'}</div>
                      </motion.div>
                    </details>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
