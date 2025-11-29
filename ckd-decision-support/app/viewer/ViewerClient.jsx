"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function ViewerClient() {
  const params = useSearchParams();
  const router = useRouter();

  // Read citation page (?cite=12)
  const citeParam = params.get("cite");

  // Use ?p= or ?cite= or fallback to page 1
  const initialPage = parseInt(params.get("p") || citeParam || "1");

  const pdfUrl = "/Ghana National CKD Protocol.pdf";

  const [numPages, setNumPages] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1.2);

  // 🔥 Auto-scroll reference
  const pageRef = useRef(null);

  // Scroll PDF page into view whenever page changes
  useEffect(() => {
    if (pageRef.current) {
      pageRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [page]);

  // Update page in URL without reloading
  const updatePageInUrl = useCallback(
    (newPage) => {
      router.replace(`/viewer?p=${newPage}`);
    },
    [router]
  );

  // Handle AI citation jumps (?cite=)
  useEffect(() => {
    if (citeParam) {
      const citedPage = parseInt(citeParam);
      if (!isNaN(citedPage)) {
        setPage(citedPage);
        router.replace(`/viewer?p=${citedPage}`);
      }
    }
  }, [citeParam, router]);

  // Zoom controls
  const zoomIn = () => setScale((s) => Math.min(s + 0.2, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.2, 0.6));
  const resetZoom = () => setScale(1.2);

  // Page navigation
  const nextPage = () => {
    if (numPages && page < numPages) {
      const newPage = page + 1;
      setPage(newPage);
      updatePageInUrl(newPage);
    }
  };

  const prevPage = () => {
    if (page > 1) {
      const newPage = page - 1;
      setPage(newPage);
      updatePageInUrl(newPage);
    }
  };

  const handlePageInput = (e) => {
    const value = parseInt(e.target.value);
    if (value >= 1 && value <= numPages) {
      setPage(value);
      updatePageInUrl(value);
    }
  };

  return (
    <div className="flex flex-col items-center p-6 space-y-4">
      <h1 className="text-2xl font-semibold mb-4">CKD Protocol Viewer</h1>

      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-white shadow px-4 py-2 rounded-lg border">
        <button
          onClick={prevPage}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          ← Prev
        </button>

        <span className="text-gray-700">
          Page
          <input
            type="number"
            className="border mx-2 px-2 py-1 rounded w-16"
            value={page}
            onChange={handlePageInput}
            min={1}
            max={numPages || 1}
          />
          of {numPages || "?"}
        </span>

        <button
          onClick={nextPage}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          Next →
        </button>

        <div className="mx-4 w-px h-6 bg-gray-300" />

        <button
          onClick={zoomOut}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          –
        </button>
        <button
          onClick={resetZoom}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          Reset
        </button>
        <button
          onClick={zoomIn}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          +
        </button>
      </div>

      {/* PDF Viewer */}
      <div className="border p-4 shadow-md bg-gray-50 rounded-lg w-full flex justify-center">
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        >
          <div ref={pageRef}>
            <Page
              pageNumber={page}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </div>
        </Document>
      </div>
    </div>
  );
}
