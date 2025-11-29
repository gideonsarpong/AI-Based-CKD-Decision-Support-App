'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const signOut = async () => {
      try {
        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error('Logout error:', error.message);
          toast.error('Logout failed. Please try again.');
          return;
        }

        toast.success('Signed out successfully!');
        // Small delay for animation + Supabase cleanup
        setTimeout(() => {
          toast.dismiss(); 
          router.replace('/login');
        }, 1200);
      } catch (err) {
        console.error('Unexpected logout error:', err);
        toast.error('Unexpected error during logout.');
      }
    };

    signOut();
  }, [router]);

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Optional LoadingOverlay for visual consistency */}
      <LoadingOverlay show={true} message="Signing you out..." />

      {/* Fallback text in case overlay fails */}
      <h2 className="text-xl font-medium text-gray-800 dark:text-gray-200 animate-pulse z-10">
        Signing out...
      </h2>
    </div>
  );
}