// components/layout/Sidebar.jsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function Sidebar() {
  const router = useRouter();
  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 bg-sky-800 text-white flex-col p-6">
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
        <Button variant="secondary" className="w-full" onClick={() => router.push('/logout')}>
          Sign Out
        </Button>
      </div>
    </aside>
  );
}