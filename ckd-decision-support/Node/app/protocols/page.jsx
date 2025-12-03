'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Toaster, toast } from 'react-hot-toast';
import Link from "next/link";

/**
 * ProtocolsPage (strict PHI-safe)
 * - Files are uploaded to the backend route which performs server-side upload + summarization.
 * - Frontend never uploads directly to Supabase storage.
 * - Lists protocols from the DB (protocols table).
 */

export default function ProtocolsPage() {
  // --- STATE ---
  const [protocols, setProtocols] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [selectedProtocol, setSelectedProtocol] = useState(null);

  // Delete modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // --- CONSTANTS ---
  const MAX_FILES = 1;
  const MAX_FILE_SIZE_MB = 50;

  // --- Helpers (client-side sanitizers for display/search only) ---
  function sanitizeBaseName(name, maxLen = 160) {
    if (!name || typeof name !== "string") return "untitled";
    let base = name.replace(/^.*[\\/]/, "");
    base = base.replace(/\.[^/.]+$/i, "");
    base = base.replace(/[^\w\s.-]/g, "");
    base = base.replace(/\s+/g, " ").trim();
    return base.slice(0, maxLen) || "untitled";
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /** Fetch protocols from DB (not storage) for PHI-safe listing */
  const refreshProtocols = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('protocols')
        .select('id, name, original_filename, uploaded_at, chunks_count, storage_key')
        .order('uploaded_at', { ascending: false });

      if (error) {
        toast.error(`Error loading protocols: ${error.message}`);
      } else {
        setProtocols(data || []);
      }
    } catch (err) {
      console.error("Refresh protocols error:", err);
      toast.error("Failed to load protocols.");
    } finally {
      setLoading(false);
    }
  }, []); 

  useEffect(() => {
    refreshProtocols();
  }, [refreshProtocols]);

  /** Summarize / upload file by sending it to the backend route (server-side upload occurs there) */
  const handleUpload = async (e) => {
    const uploaded = e.target.files;
    if (!uploaded?.length) return;

    if (protocols.length + uploaded.length > MAX_FILES) {
      toast.error(`You can only have up to ${MAX_FILES} protocols.`);
      return;
    }

    //  Validate all files before starting any uploads
    for (const file of uploaded) {
      if (file.size / 1024 / 1024 > MAX_FILE_SIZE_MB) {
        toast.error(`"${file.name}" exceeds ${MAX_FILE_SIZE_MB} MB.`);
        return;
      }
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast.error(`Only PDF files are accepted: ${file.name}`);
        return;
      }
    }

    setUploading(true);

    try {
      // Process uploads sequentially with better error handling
      for (const file of uploaded) {
        const form = new FormData();
        form.append("file", file);
        const safeBase = sanitizeBaseName(file.name);

        // Use toast.promise for cleaner UX
        await toast.promise(
          fetch("/api/protocols/summarize", {
            method: "POST",
            body: form,
          }).then(async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(json?.error || "Upload failed");
            }
            return json;
          }),
          {
            loading: `Uploading & summarizing ${safeBase}...`,
            success: `✅ ${safeBase} uploaded & summarized`,
            error: (err) => `⚠️ Error with ${safeBase}: ${err.message}`,
          }
        );
      }

      await refreshProtocols();
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      // Always clear file input
      if (e.target) e.target.value = "";
    }
  };

  /** Trigger delete confirmation modal */
  const confirmDelete = (protocol) => {
    setPendingDelete(protocol);
    setShowConfirm(true);
  };

  /** Execute delete via backend route (server-side deletion) */
  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);

    try {
      const res = await fetch("/api/protocols/summarize", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocolId: pendingDelete.id }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Delete failed");
      }

      toast.success(`🗑️ Deleted ${pendingDelete.name || pendingDelete.original_filename}`);
      await refreshProtocols();
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
      setShowConfirm(false);
      setPendingDelete(null);
    }
  };

  /** View summary modal using data in DB row (protocols table) */
  const handleViewSummary = async (protocol) => {
    try {
      const { data, error } = await supabase
        .from('protocols')
        .select('protocol_summaries, uploaded_at, name, sections, chunks_count')
        .eq('id', protocol.id)
        .limit(1)
        .single();

      if (error) {
        toast.error(`Database error: ${error.message}`);
        return;
      }

      if (!data?.protocol_summaries?.trim()) {
        toast.error('No summary found for this protocol.');
        return;
      }

      setSelectedProtocol({
        name: data.name,
        uploaded_at: data.uploaded_at,
        sections: data.sections,
        chunks_count: data.chunks_count,
      });

      setSelectedSummary(data.protocol_summaries);
      toast.success(`Summary loaded for ${protocol.name || protocol.original_filename}`);
    } catch (err) {
      console.error('Fetch summary error:', err);
      toast.error('Error loading summary.');
    }
  };

  /** Memoized search filtering using debounced value */
  const filtered = useMemo(() => {
    if (!debouncedSearch) return protocols;
    
    const q = debouncedSearch.toLowerCase();
    return protocols.filter((p) => 
      (p.name || "").toLowerCase().includes(q) ||
      (p.original_filename || "").toLowerCase().includes(q)
    );
  }, [protocols, debouncedSearch]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex justify-center py-10 relative">
      <Toaster position="top-center" reverseOrder={false} />

      <div className="w-full max-w-3xl bg-white shadow-lg rounded-2xl p-6 border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">📄 Protocols Manager</h1>

          <Link
            href="/"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
          >
            ← Main Form
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <input
            type="text"
            placeholder="Search protocols..."
            className="w-full border rounded-lg px-4 py-2 pl-10 focus:ring-2 focus:ring-blue-400 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Upload Area */}
        <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 mb-5 text-center hover:border-blue-400 transition">
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleUpload}
            disabled={uploading || protocols.length >= MAX_FILES}
            className="hidden"
            id="fileUpload"
          />
          <label
            htmlFor="fileUpload"
            className={`cursor-pointer inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition ${
              uploading || protocols.length >= MAX_FILES ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Upload Protocols (PDF)
          </label>
          <p className="text-xs text-gray-500 mt-2">
            PDF only | Max {MAX_FILE_SIZE_MB} MB | Up to {MAX_FILES} protocols
          </p>
        </div>

        {/* Upload + Loading Indicators */}
        {uploading && (
          <div className="flex items-center gap-2 text-blue-600 mb-3">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Uploading...
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-gray-600 mb-3">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading protocols...
          </div>
        )}

        {/* File List */}
        <div className="space-y-2">
          {filtered.length === 0 && !loading && (
            <p className="text-center text-gray-500 text-sm mt-4">
              {searchQuery ? "No protocols match your search." : "No protocols uploaded yet. Start by uploading your first protocol above."}
            </p>
          )}

          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition border px-3 py-2 rounded-lg"
            >
              <span className="truncate text-gray-700">
                {(p.name || p.original_filename)?.replace(/\s*\(.*?\)/, "")}
              </span>

              <div className="flex items-center gap-3">
                <Link
                  href={`${process.env.NEXT_PUBLIC_APP_URL}/viewer?p=${p.page_number || 1}`}
                  target="_blank"
                  className="text-blue-600 hover:text-blue-800 text-sm whitespace-nowrap"
                >
                  View File
                </Link>

                <button
                  onClick={() => handleViewSummary(p)}
                  className="text-green-600 hover:text-green-800 text-sm whitespace-nowrap"
                >
                  View Summary
                </button>

                <button
                  onClick={() => confirmDelete(p)}
                  disabled={deletingId === p.id}
                  className={`text-red-600 hover:text-red-800 text-sm whitespace-nowrap ${
                    deletingId === p.id ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {deletingId === p.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 animate-fadeIn">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Confirm Deletion
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to permanently delete{' '}
              <span className="font-medium text-red-500">{pendingDelete?.name || pendingDelete?.original_filename}</span>?<br />
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setPendingDelete(null);
                }}
                disabled={deletingId}
                className="px-4 py-2 rounded-lg border dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletingId}
                className={`px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition ${
                  deletingId ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {deletingId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {selectedSummary && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 relative max-h-[90vh] overflow-hidden flex flex-col">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {selectedProtocol?.name}
            </h2>

            <p className="text-sm text-gray-500 mb-4">
              Uploaded at: {new Date(selectedProtocol?.uploaded_at).toLocaleString()} <br />
              Sections: {selectedProtocol?.sections?.length ?? 0} <br />
              Text Chunks: {selectedProtocol?.chunks_count ?? "N/A"}
            </p>

            <div className="flex-1 overflow-y-auto border rounded-md p-4 bg-gray-50 text-gray-700 whitespace-pre-line">
              {selectedSummary}
            </div>

            <button
              onClick={() => {
                setSelectedSummary(null);
                setSelectedProtocol(null);
              }}
              className="absolute top-3 right-4 text-gray-500 hover:text-gray-800 text-xl font-bold"
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Fade Animation */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}