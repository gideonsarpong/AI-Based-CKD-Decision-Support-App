'use client';

import { useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toastState, setToastState] = useState({
    visible: false,
    title: '',
    description: '',
    variant: '',
  });

  const timerRef = useRef(null);

  const toast = ({ title, description = '', variant = 'success', duration = 3000 }) => {
    // Clear any existing timeout
    if (timerRef.current) clearTimeout(timerRef.current);

    // Show toast
    setToastState({ visible: true, title, description, variant });

    // Auto-hide after duration
    timerRef.current = setTimeout(() => {
      setToastState((prev) => ({ ...prev, visible: false }));
    }, duration);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // --- Rendered Toast View ---
  const ToastView = toastState.visible ? (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg transition-transform transform-gpu duration-300 ease-in-out ${
        toastState.variant === 'destructive'
          ? 'bg-red-600 text-white'
          : 'bg-emerald-600 text-white'
      }`}
    >
      <div className="flex items-center space-x-2">
        <span className="text-lg">{toastState.variant === 'destructive' ? '⚠️' : '✅'}</span>
        <div>
          <strong className="block font-medium">{toastState.title}</strong>
          {toastState.description && (
            <span className="block text-sm opacity-90">{toastState.description}</span>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return { toast, ToastView };
}