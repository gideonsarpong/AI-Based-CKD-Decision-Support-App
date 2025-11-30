//declaring the global variables and imports
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Link from 'next/link';

export default function Dashboard() {
  const [rows, setRows] = useState([]);
  const [stages, setStages] = useState([]);
  const [filterStage, setFilterStage] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [modalData, setModalData] = useState(null);

  // Fetch patients
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        let query = supabase
          .from('patients')
          .select('*')
          .order('created_at', { ascending: false });

        if (filterStage) query = query.eq('ckd_stage', filterStage);
        if (startDate)
          query = query.gte('created_at', new Date(startDate).toISOString());
        if (endDate)
          query = query.lte('created_at', new Date(endDate).toISOString());

        const { data, error } = await query;
        if (error) throw error;
        setRows(data || []);
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to load patient records. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filterStage, startDate, endDate]);

  // Fetch stages
  useEffect(() => {
    const fetchStages = async () => {
      const { data, error } = await supabase.from('patients').select('ckd_stage');
      if (!error) {
        const uniqueStages = [
          ...new Set((data || []).map((r) => r.ckd_stage).filter(Boolean)),
        ];
        setStages(uniqueStages);
      }
    };
    fetchStages();
  }, []);

  // CSV Export
  const downloadCsv = () => {
    const headers = [
      'Date',
      'Patient ID',
      'CKD Stage',
      'Protocol',
      'Recommendation',
      'Investigations',
      'Treatment',
      'Validation Notes',
    ];
    const lines = [headers.join(',')];
    rows.forEach((r) => {
      const line = [
        new Date(r.created_at).toISOString(),
        r.patient_identifier || r.id,
        r.ckd_stage || '',
        `"${(r.protocol_used || '').replace(/"/g, '""')}"`,
        `"${(r.recommendation || '').replace(/"/g, '""')}"`,
        `"${(r.suggested_investigations || '').replace(/"/g, '""')}"`,
        `"${(r.suggested_treatment || '').replace(/"/g, '""')}"`,
        `"${(r.validation_notes || '').replace(/"/g, '""')}"`,
      ].join(',');
      lines.push(line);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ckd-recommendations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF Export
  const downloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('CKD Decision Support Recommendations', 14, 18);

    const clinicianName = rows[0]?.profiles?.full_name || rows[0]?.clinician_id || 'Clinician';
    const reportDate = new Date().toLocaleString();
    doc.setFontSize(8);
    doc.text(`Clinician: ${clinicianName}`, 14, 23);
    doc.text(`Report Date: ${reportDate}`, 150, 23);

    const sanitize = (val) => (val ? String(val).slice(0, 100) : '—');
    const tableData = rows.map((r) => [
      new Date(r.created_at).toLocaleDateString(),
      sanitize(r.patient_identifier || r.id),
      sanitize(r.ckd_stage),
      sanitize(r.protocol_used),
      sanitize(r.recommendation),
      sanitize(r.suggested_investigations),
      sanitize(r.suggested_treatment),
      sanitize(r.validation_notes),
    ]);

    autoTable(doc, {
      head: [
        [
          'Date',
          'Patient ID',
          'CKD Stage',
          'Protocol',
          'Recommendation',
          'Investigations',
          'Treatment',
          'Validation Notes',
        ],
      ],
      body: tableData,
      startY: 26,
      styles: { fontSize: 8, cellWidth: 'wrap', overflow: 'linebreak', wordWrap: true },
      columnStyles: { 4: { cellWidth: 40 }, 5: { cellWidth: 30 }, 6: { cellWidth: 30 }, 7: { cellWidth: 40 } },
      headStyles: { fillColor: [37, 99, 235] },
      didDrawPage: (data) => {
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text('Confidential - For Clinical Use Only', data.settings.margin.left, doc.internal.pageSize.height - 10);
      },
    });

    doc.save('ckd-recommendations.pdf');
  };

  // --- Helper to render validation badge ---
  const ValidationBadge = ({ notes }) => {
    if (!notes) return null;
    const isClean = notes.toLowerCase().includes('no issues');
    return (
      <span
        className={`inline-block px-2 py-1 text-xs font-medium rounded ${
          isClean
            ? 'bg-green-100 text-green-700 border border-green-300'
            : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
        }`}
      >
        {isClean ? 'No issues found' : 'Issues flagged'}
      </span>
    );
  };

  // Apply “Show Only Issues” filter
  const filteredRows = showIssuesOnly
    ? rows.filter(
        (r) => r.validation_notes && !r.validation_notes.toLowerCase().includes('no issues')
      )
    : rows;

  const filteredSummary = `Showing ${filteredRows.length} ${
    filteredRows.length === 1 ? 'record' : 'records'
  } ${filterStage ? `for Stage ${filterStage}` : ''} ${
    startDate || endDate ? `between ${startDate || '—'} and ${endDate || '—'}` : ''
  }`;
  return (
    <div className="p-6 font-sans">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">Clinician Dashboard</h2>

      {/* Navigation */}
      <Link
        href="/"
        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
      >
        ← Main Form
      </Link>

      {/* Filters */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 shadow-sm flex flex-wrap items-center gap-3">
        <button
          onClick={downloadCsv}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium"
        >
          Export CSV
        </button>
        <button
          onClick={downloadPdf}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-md text-sm font-medium"
        >
          Export PDF
        </button>

        {/* Stage filter */}
        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">All Stages</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Date range */}
        <label className="text-sm text-gray-700">
          From:{' '}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 ml-1"
          />
        </label>

        <label className="text-sm text-gray-700">
          To:{' '}
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 ml-1"
          />
        </label>

        {/* Show only issues 
        <label className="flex items-center gap-2 text-sm text-gray-700 ml-2">
          <input
            type="checkbox"
            checked={showIssuesOnly}
            onChange={(e) => setShowIssuesOnly(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          Show only flagged issues
        </label>*/}
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[70vh] border border-gray-200 rounded-md">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {[
                'Date',
                'Patient ID',
                'CKD Stage',
                'Protocol',
                'Recommendation',
                'Investigations',
                'Treatment',
                'Details',
              ].map((h) => (
                <th key={h} className="px-3 py-2 border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !loading ? (
              <tr>
                <td colSpan="10" className="text-center py-4 text-gray-500">
                  No records found.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, i) => (
                <tr
                  key={r.id}
                  className={`${
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-blue-50 transition`}
                >
                  <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.patient_identifier || r.id}</td>
                  <td className="px-3 py-2">{r.ckd_stage}</td>
                  <td className="px-3 py-2">{r.protocol_used}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap">{r.recommendation}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap">{r.suggested_investigations}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap">{r.suggested_treatment}</td>
                  <td className="px-3 py-2">
                    <ValidationBadge notes={r.validation_notes} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                      onClick={() => setModalData(r)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalData && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
          onClick={() => setModalData(null)}
        >
          <div
            className="bg-white rounded-lg p-5 max-w-xl w-11/12 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-800">
              AI Explanation for {modalData.patient_identifier || modalData.id}
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">
              {modalData.ai_explanation || 'No detailed rationale available.'}
            </p>

            {modalData.validation_notes && (
              <div
                className={`p-3 rounded-md text-sm border ${
                  modalData.validation_notes.toLowerCase().includes('no issues')
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                }`}
              >
                <strong>Validation Notes:</strong> {modalData.validation_notes}
              </div>
            )}

            <div className="mt-4 text-right">
              <button
                onClick={() => setModalData(null)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}