// hooks/useCKDStage.js
'use client';

import { useCallback } from 'react';

export default function useCKDStage() {
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

  return { determineStage };
}