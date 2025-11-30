'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ClarificationChat({
  protocolId,
  patientIdentifier,
  token,
  onChatSaved, // callback to parent form
}) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatIds, setChatIds] = useState([]); // track chat IDs
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  // --- Auto-scroll to latest message ---
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // ✅ Safe effect: notify parent when chatIds change
  useEffect(() => {
    if (onChatSaved && chatIds.length > 0) {
      onChatSaved(chatIds);
    }
  }, [chatIds, onChatSaved]);

  // --- Core ask handler ---
  const handleAsk = useCallback(async () => {
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion('');
    setLoading(true);

    // Append clinician message immediately
    setMessages((prev) => [...prev, { role: 'clinician', content: q }]);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: q,
          protocol_id: protocolId,
          patient_identifier: patientIdentifier,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'AI response failed');

      // Capture chat_id (RAG)
      const newChatId = json.data?.chat_id;
      if (newChatId && !chatIds.includes(newChatId)) {
        // ✅ Update local chatIds — parent notified via useEffect
        setChatIds((prev) => [...prev, newChatId]);
      }

      // Add AI response
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: json.data.answer,
          sections: json.data.retrieved_sections,
        },
      ]);
    } catch (err) {
      console.error('❌ Clarification chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            '⚠️ Sorry, I could not process that question. Please try again or rephrase.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [question, token, protocolId, patientIdentifier, chatIds]);

  // --- Handle Enter key ---
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAsk();
      }
    },
    [handleAsk]
  );

  return (
    <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl shadow-sm p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
        💬 Clarify AI Recommendation
      </h3>
      <p className="text-sm text-gray-600 mb-3">
        Ask follow-up questions to understand or verify the AI’s recommendations.
        Responses are based on Ghana’s CKD Protocol.
      </p>

      {/* Chat window */}
      <div
        ref={chatRef}
        className="bg-white border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto mb-3"
      >
        {messages.length === 0 ? (
          <p className="text-gray-400 text-sm">No questions asked yet.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="mb-3">
              {m.role === 'clinician' ? (
                <div className="text-sm">
                  <span className="font-semibold text-blue-700">Clinician:</span>{' '}
                  <span className="text-gray-800">{m.content}</span>
                </div>
              ) : (
                <div className="text-sm mt-1">
                  <span className="font-semibold text-green-700">AI:</span>{' '}
                  <span className="text-gray-800 whitespace-pre-wrap">{m.content}</span>
                  {m.sections !== undefined && (
                    <div className="text-xs text-gray-500 mt-1">
                      🔍 Context retrieved: {m.sections} section(s)
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* --- AI typing feedback --- */}
        {loading && (
          <div className="text-xs text-gray-500 italic animate-pulse mt-1">
            AI is thinking...
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Ask for clarification (e.g. Why dialysis at Stage 5?)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1"
        />
        <Button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </Button>
      </div>
    </div>
  );
}
