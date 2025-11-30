'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { toast, Toaster } from 'react-hot-toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';

export default function LogoutPage() {
  const router = useRouter();
  const hasLoggedOut = useRef(false); // prevents double execution

  useEffect(() => {
    if (hasLoggedOut.current) return;
    hasLoggedOut.current = true;

    const signOut = async () => {
      toast.dismiss();

      const { error } = await supabase.auth.signOut();

      if (error) {
        toast.error('Logout failed: ' + error.message);
        return;
      }

      toast.success('Signed out successfully!');
      setTimeout(() => {
        toast.dismiss();
        router.replace('/login');
      }, 900);
    };

    signOut();
  }, [router]);

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <Toaster />
      <LoadingOverlay show={true} message="Signing you out..." />

      <h2 className="text-xl font-medium text-gray-800 dark:text-gray-200 animate-pulse z-10">
        Signing out...
      </h2>
    </div>
  );
}
