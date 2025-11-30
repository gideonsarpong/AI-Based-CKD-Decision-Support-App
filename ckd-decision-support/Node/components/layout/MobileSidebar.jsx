// components/layout/MobileSidebar.jsx
'use client';

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function MobileSidebar({ isOpen, onClose }) {
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (isOpen && sidebarRef.current) {
      const focusable = sidebarRef.current.querySelectorAll('a, button');
      focusable[0]?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 z-50 flex"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        className="w-64 bg-sky-800 text-white p-6 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        ref={sidebarRef}
      >
        <h2 className="text-2xl font-semibold mb-6">CKD Clinical Decision Support</h2>
        <nav className="flex-1 space-y-2">
          <Link href="/dashboard" className="block py-2 px-3 rounded hover:bg-sky-700 transition">
            Clinician Dashboard
          </Link>
          <Link href="/protocols" className="block py-2 px-3 rounded hover:bg-sky-700 transition">
            Manage Protocols
          </Link>
        </nav>
        <div className="mt-auto pt-6 space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => (location.href = '/logout')}>
            Sign Out
          </Button>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close Menu
          </Button>
        </div>
      </motion.aside>
    </motion.div>
  );
}