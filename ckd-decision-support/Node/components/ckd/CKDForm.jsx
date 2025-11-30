// components/ckd/CKDForm.jsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CKDForm({
  form,
  updateField,
  protocols,
  onSubmit,
  loading,
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Patient ID */}
      <div>
        <label className="block text-sm font-medium mb-1">Patient ID</label>
        <Input
          placeholder="Enter patient ID"
          value={form.patient_identifier}
          onChange={(e) => updateField('patient_identifier', e.target.value)}
        />
      </div>

      {/* Facility */}
      <div>
        <label className="block text-sm font-medium mb-1">Level of Facility</label>
        <select
          className="w-full rounded-lg border px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
          value={form.level_of_facility}
          onChange={(e) => updateField('level_of_facility', e.target.value)}
          required
        >
          <option value="">-- Select facility level --</option>
          <option value="CHPS, Health Center, clinics (without a doctor)">
            CHPS, Health Center, clinics (without a doctor)
          </option>
          <option value="Clinics/Polyclinics and Hospitals (with a doctor)">
            Clinics / Polyclinics and Hospitals (with a doctor)
          </option>
          <option value="Regional and tertiary hospitals (Health facility with a Specialist)">
            Regional and tertiary hospitals (with a Specialist)
          </option>
        </select>
      </div>

      {/* Age & eGFR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Age (years)</label>
          <Input
            type="number"
            placeholder="Enter age"
            value={form.age}
            onChange={(e) => updateField('age', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">eGFR (mL/min/1.73 m²)</label>
          <Input
            type="number"
            placeholder="Enter eGFR value"
            value={form.egfr}
            onChange={(e) => updateField('egfr', e.target.value)}
            required
          />
        </div>
      </div>

      {/* Comorbidities */}
      <div>
        <span className="block text-sm font-medium mb-2">Comorbid Conditions</span>
        <div className="flex flex-wrap gap-4 items-center">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.diabetes}
              onChange={(e) => updateField('diabetes', e.target.checked)}
              className="accent-sky-600"
            />
            Diabetes
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.hypertension}
              onChange={(e) => updateField('hypertension', e.target.checked)}
              className="accent-sky-600"
            />
            Hypertension
          </label>
        </div>
      </div>

      {/* Protocol */}
      <div>
        <label className="block text-sm font-medium mb-1">Select Protocol</label>
        <select
          className="w-full rounded-lg border px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
          value={form.protocol_id ?? ''}
          onChange={(e) => updateField('protocol_id', e.target.value || null)}
        >
          <option value="">-- Use default protocol --</option>
          {protocols.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.version ? `v${p.version}` : ''} {p.is_active ? '(active)' : ''}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Evaluating…' : 'Generate AI Recommendation'}
      </Button>

      {/* Disclaimer */}
      <div className="mt-6 p-5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700 transition-colors shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-800 flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-amber-700 dark:text-amber-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l-7.07 12.26a2 2 0 001.73 2.88h14.08a2 2 0 001.73-2.88L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
            <strong className="font-semibold text-amber-700 dark:text-amber-300">Disclaimer:</strong>{' '}
            This tool provides guideline-based information only and does not store any user data.<br />
            It is intended for educational and clinical decision support purposes and should not replace professional medical judgement.<br />
            💬 Ask questions before saving (AI answers are grounded in the Ghana CKD protocol.)
          </p>
        </div>
      </div>
    </form>
  );
}
