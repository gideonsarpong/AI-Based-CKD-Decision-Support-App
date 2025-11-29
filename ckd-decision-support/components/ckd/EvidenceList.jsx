// components/ckd/EvidenceList.jsx
'use client';

import React from 'react';

export default function EvidenceList({ sections }) {
  if (!sections || sections.length === 0) {
    return (
      <div className="mt-2 text-sm text-gray-500 bg-gray-50 dark:bg-gray-800/30 p-2 rounded-md italic">
        No citation found.
      </div>
    );
  }

  return (
    <div className="mt-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md">
      <strong>Citation:</strong>
      {sections.slice(0, 3).map((sec, i) => (
        <span key={i} className="block">
          • {sec.section_title || sec.title || 'Untitled section'}
          {sec.page_number != null && sec.page_number !== '' ? (
            <span className="text-xs text-blue-500"> (p.{sec.page_number})</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}