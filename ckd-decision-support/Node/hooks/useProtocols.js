// hooks/useProtocols.js
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function useProtocols() {
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchProtocols = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('protocols')
        .select('id,name,version,is_active,uploaded_at')
        .order('uploaded_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setProtocols(data ?? []);
    } catch (err) {
      console.error('Failed to fetch protocols', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProtocols();
  }, [fetchProtocols]);

  return { protocols, fetchProtocols, loading };
}