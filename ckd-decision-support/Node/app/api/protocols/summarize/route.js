export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/* -------------------- ENV -------------------- */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PY_API_URL = (process.env.PY_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
if (!APP_URL) {
  console.error("❌ NEXT_PUBLIC_APP_URL missing — viewer links cannot be generated.");
}

/* -------------------- Supabase -------------------- */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

/* -------------------- Helpers -------------------- */
function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sanitizeBaseName(name, maxLen = 160) {
  if (!name || typeof name !== "string") return "untitled";
  let base = name.replace(/^.*[\\/]/, "");
  base = base.replace(/\.[^/.]+$/i, "");
  base = base.replace(/[^\w\s.-]/g, "");
  base = base.replace(/\s+/g, " ").trim();
  return base.slice(0, maxLen) || "untitled";
}

/* -------------------- Viewer Link Generator -------------------- */
function makePageLink(page) {
  return `${APP_URL}/viewer?page=${page}`;
}

/* -------------------- Timeout Fetch -------------------- */
async function fetchWithTimeout(url, opts = {}, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------- Embedding Helpers -------------------- */
async function embedTextSafe(text, retries = 3) {
  if (!text || !String(text).trim()) return null;
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    const json = await res.json();
    return json?.data?.[0]?.embedding || null;
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      return embedTextSafe(text, retries - 1);
    }
    return null;
  }
}

const EMBEDDING_CHUNK_SIZE = 1500;
function splitForEmbedding(text, size = EMBEDDING_CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function embedLargeText(text, chunkSize = EMBEDDING_CHUNK_SIZE, concurrency = 4) {
  if (!text) return null;
  const chunks = splitForEmbedding(text, chunkSize);

  const executing = [];
  const results = [];

  for (const chunk of chunks) {
    const p = embedTextSafe(chunk).then((vec) => {
      executing.splice(executing.indexOf(p), 1);
      return vec;
    });
    executing.push(p);
    results.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  const vecs = (await Promise.all(results)).filter(Boolean);
  if (!vecs.length) return null;

  const dim = vecs[0].length;
  const out = Array(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vecs.length;
  return out;
}

/* -------------------- parallelLimit -------------------- */
async function parallelLimit(items, limit, fn) {
  const executing = [];
  const results = [];

  for (const item of items) {
    const p = fn(item).then((res) => {
      executing.splice(executing.indexOf(p), 1);
      return res;
    });

    executing.push(p);
    results.push(p);

    if (executing.length >= limit) await Promise.race(executing);
  }

  return Promise.all(results);
}

/* -------------------- Python API with Retry -------------------- */
async function callPythonExtractor(buf, safeName, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const pyForm = new FormData();
      pyForm.append("file", new Blob([buf]), safeName);

      const pyRes = await fetchWithTimeout(`${PY_API_URL}/extract`, {
        method: "POST",
        body: pyForm,
      });

      if (pyRes.ok) {
        return await pyRes.json();
      }
      
      if (attempt === retries) {
        throw new Error(await pyRes.text());
      }
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Python extractor attempt ${attempt + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/* -------------------- Sectionize -------------------- */
async function llmSectionize(text) {
  const snippet = text.slice(0, 30000);
  const prompt = `
Extract section titles from the protocol text and return JSON:

{"sections":[{"title":"Diagnosis","start_offset":1200}]}

Only valid JSON.
TEXT:
${snippet}
`;

  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [{ role: "user", content: prompt }],
      max_output_tokens: 900,
    }),
  });

  const json = await res.json().catch(() => ({}));
  const raw = json.output?.[0]?.content?.[0]?.text || "";

  try {
    return JSON.parse(raw);
  } catch {
    const rec = raw.match(/\{[\s\S]*\}/);
    if (rec) return JSON.parse(rec[0]);
    return { sections: [] };
  }
}

/* -------------------- Summaries -------------------- */
async function generateSummary(text, filename, isLimited) {
  // ✅ FIX: Define trimmed variable
  const trimmed = text.slice(0, 30000);
  
  let prompt;
  if (isLimited) {
    prompt = `
You are summarizing the CKD clinical protocol titled "${filename}".

Produce a clear and clinically accurate **300–500 word summary** organized into
the following **mandatory 7 Markdown sections**:

1. **CKD Staging**  
2. **KFRE Risk Score Interpretation**  
3. **CKD Progression & Management**  
4. **Monitoring Frequency**  
5. **Referral Criteria**  
6. **Investigations & Monitoring**  
7. **Treatment Recommendations**

--------------------------------------
CLINICAL SAFETY & HALLUCINATION RULES
--------------------------------------
- Preserve ALL numeric and quantitative values exactly as they appear 
  (e.g., eGFR thresholds, KFRE % categories, lab cutoffs, BP targets, monitoring intervals).
- Preserve any existing viewer citation markers exactly as written 
  (e.g., [↗ p.X](URL)).
- **Never invent page numbers.**
- **Never fabricate numeric values.**
- If a required value is not present in the text, write:
  "*The protocol text does not specify this value.*"
- If the text is incomplete or limited, summarize based on **only what is provided**
  and supplement using **general CKD guideline principles** *without making up 
  document-specific details*.

--------------------------------------
SUMMARY LOGIC
--------------------------------------
If the extracted text below contains real protocol content:
- Ground the summary strictly on the provided text.
- Pull all numeric cutoffs directly from it.
- Use the 7-section structure above even if the protocol itself is not structured
  this way.

If the extracted text is empty, truncated, or clearly insufficient:
- Use the 7-section structure above.
- Base the summary on general CKD clinical standards.
- Do NOT add any document-specific numbers or page references.

--------------------------------------
PROVIDED TEXT (may be partial, full, empty, or truncated):
TEXT:
${trimmed}`;
  } else {
    prompt = `
You are summarizing the CKD clinical protocol titled "${filename}".

Produce a comprehensive clinical summary preserving all numeric values and citations.

TEXT:
${trimmed}`;
  }

  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [{ role: "user", content: prompt }],
      max_output_tokens: 900,
      temperature: 0.1,
    }),
  });

  const j = await res.json().catch(() => ({}));
  return j.output?.[0]?.content?.[0]?.text?.trim() || null;
}

/* ============================================================
   POST START
   =========================================================== */

export async function POST(req) {
  const startTime = Date.now();
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const originalName = file.name || "Uploaded.pdf";
    const safeBase = sanitizeBaseName(originalName);
    const safeName = `${safeBase}.pdf`;

    // ✅ OPTIMIZATION: Add file size check
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    /* -------- 1. Python extractor with retry -------- */
    const { full_text, pages, page_count, ocr_used } = await callPythonExtractor(buf, safeName);

    /* -------- 2. Build page offset table -------- */
    let running = 0;
    const pageOffsets = pages.map((p) => {
      const start = running;
      const end = running + (p.text?.length || 0);
      running = end;
      return { page: p.page_number, start_offset: start, end_offset: end };
    });

    function getPage(offset) {
      const row = pageOffsets.find(
        (x) => offset >= x.start_offset && offset < x.end_offset
      );
      return row?.page || 1;
    }

    /* -------- 3. Cache check -------- */
    const textHash = sha256Hex(full_text);
    const { data: cached } = await supabase
      .from("protocol_cache")
      .select("summary")
      .eq("hash", textHash)
      .maybeSingle();

    if (cached?.summary) {
      return NextResponse.json({
        ok: true,
        cached: true,
        summary: cached.summary,
      });
    }

    /* -------- 4. Sectionization -------- */
    const sData = await llmSectionize(full_text);
    const sections = (sData.sections || []).map((s) => ({
      ...s,
      page_number: getPage(s.start_offset),
    }));

    /* -------- 5. Chunking with page mapping -------- */
    const CHUNK_SIZE = 3200;
    const chunks = [];
    let off = 0;

    while (off < full_text.length) {
      const slice = full_text.slice(off, off + CHUNK_SIZE).trim();
      chunks.push({
        text: slice,
        start_offset: off,
        page_number: getPage(off),
      });
      off += CHUNK_SIZE;
    }

    /* -------- 6. Chunk summaries (parallel) with embedded viewer links -------- */
    const CHUNK_SUMMARY_CONCURRENCY = 6;

    const chunkPromptForPage = (c) => `
You are summarizing a chunk of a clinical protocol (2-6 sentences).
Focus on:
- CKD staging thresholds
- KFRE Risk Score 
- CKD Progression and Management
- Monitoring frequency
- Referral criteria
- Investigations
- Treatment recommendations

If you mention a specific figure, threshold, or instruction present in this chunk, append a clickable Markdown citation in this exact format:
[↗ p.<PAGE>](<URL>)

**DO NOT invent page numbers.** Use the provided chunk page only.

Chunk page: ${c.page_number}

TEXT:
${c.text}
`;

    const chunkSummaries = await parallelLimit(
      chunks,
      CHUNK_SUMMARY_CONCURRENCY,
      async (c) => {
        try {
          const r = await fetchWithTimeout("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              input: [{ role: "user", content: chunkPromptForPage(c) }],
              temperature: 0.05,
              max_output_tokens: 400,
            }),
          }, 120_000);

          const j = await r.json().catch(() => ({}));
          let text = j.output?.[0]?.content?.[0]?.text?.trim() || "";

          const pageLink = makePageLink(c.page_number);
          text = text
            .replace(/\(p\.(\d{1,4})\)/g, () => `[↗ p.${c.page_number}](${pageLink})`)
            .replace(/\[p\.(\d{1,4})\]/g, () => `[↗ p.${c.page_number}](${pageLink})`)
            .replace(/\[↗\s?p\.(\d{1,4})\]/g, () => `[↗ p.${c.page_number}](${pageLink})`);

          return text;
        } catch (err) {
          console.warn("chunk summary failed:", String(err));
          return "";
        }
      }
    );

    /* -------- 7. Final summary (preserve embedded links) -------- */
    const combined = chunkSummaries.filter(Boolean).join("\n\n---\n\n") || full_text;
    const finalSummary =
      (await generateSummary(combined, safeName, !!ocr_used)) ||
      combined.slice(0, 10000);

    /* -------- 8. Upload PDF to Supabase storage -------- */
    const uuid = crypto.randomUUID();
    const storageKey = `protocols/${uuid}.pdf`;
    let fileUrl = null;

    const { error: uploadErr } = await supabase.storage
      .from("protocols")
      .upload(storageKey, buf, { upsert: true });

    if (!uploadErr) {
      const { data: signed } = await supabase.storage
        .from("protocols")
        .createSignedUrl(storageKey, 60 * 60);
      fileUrl = signed?.signedUrl || null;
    } else {
      console.warn("Supabase upload error:", uploadErr);
    }

    /* -------- 9. Embeddings (protocol-level) -------- */
    let protocolEmbedding = await embedLargeText(full_text, EMBEDDING_CHUNK_SIZE, 4);
    if (!protocolEmbedding) protocolEmbedding = await embedLargeText(finalSummary, EMBEDDING_CHUNK_SIZE, 4);

    /* -------- 10. Insert protocol row (initial) -------- */
    const totalTimeMs = Date.now() - startTime;

    const { data: inserted, error: protoErr } = await supabase
      .from("protocols")
      .insert({
        name: safeBase,
        original_filename: originalName,
        version: "1.0",
        country: "Ghana",
        protocol_summaries: finalSummary,
        uploaded_by: null,
        uploaded_at: new Date().toISOString(),
        is_active: true,
        embedding: protocolEmbedding,
        updated_at: new Date().toISOString(),
        sections,
        section_embeddings: null,
        file_url: fileUrl,
        storage_key: storageKey,
        chunks_count: chunks.length,
        processing_time_ms: totalTimeMs,
      })
      .select()
      .single();

    if (protoErr) {
      console.error("Insert protocol error:", protoErr);
      return NextResponse.json({ error: "Protocol insert failed", details: protoErr.message }, { status: 500 });
    }
    const protocolId = inserted.id;

    /* -------- 11. Section embeddings (parallel) -------- */
    const sectionEmbeddings = await parallelLimit(
      sections.map((s, idx) => ({ s, idx })),
      3,
      async ({ s, idx }) => {
        const next = sections[idx + 1];
        const textSlice = full_text.slice(s.start_offset, next ? next.start_offset : full_text.length);
        const emb = await embedLargeText(textSlice, EMBEDDING_CHUNK_SIZE, 3);
        return {
          title: s.title,
          start_offset: s.start_offset,
          page_number: s.page_number,
          embedding: emb,
        };
      }
    );

    /* -------- 12. Chunk embeddings & insert (parallel) -------- */
    const embeddedChunks = await parallelLimit(
      chunks.map((c, idx) => ({ ...c, idx })),
      3,
      async (c) => {
        const emb = await embedLargeText(c.text, EMBEDDING_CHUNK_SIZE, 3);
        return {
          chunk_index: c.idx,
          chunk_text: c.text,
          start_offset: c.start_offset,
          page_number: c.page_number,
          section_title: sections.length ? sections[0].title : "Uncategorized",
          embedding: emb,
        };
      }
    );

    const chunkRows = embeddedChunks.map((c) => ({
      protocol_id: protocolId,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      start_offset: c.start_offset,
      page_number: c.page_number,
      section_title: c.section_title,
      embedding: c.embedding,
    }));

    if (chunkRows.length) {
      await supabase.from("protocol_chunks").insert(chunkRows);
    }

    /* -------- 13. Citation metadata extraction (embedded links) -------- */
    const citationRegex = /\[↗\s?p\.(\d{1,4})\]\((https?:\/\/[^\s)]+)\)/g;
    const citations = [];
    chunkSummaries.forEach((summ, idx) => {
      let m;
      while ((m = citationRegex.exec(summ)) !== null) {
        const page = Number(m[1]);
        const url = m[2];
        const snippet = (chunks[idx]?.text || "").slice(0, 300);
        citations.push({ page, url, chunk_index: idx, snippet });
      }
    });

    /* -------- 14. ✅ OPTIMIZATION: Combine database updates -------- */
    await Promise.all([
      // Update protocol with section_embeddings and citations in one call
      supabase.from("protocols").update({ 
        section_embeddings: sectionEmbeddings,
        citations 
      }).eq("id", protocolId),
      
      // Insert summary
      supabase.from("protocol_summaries").insert({
        protocol_id: protocolId,
        filename: safeName,
        summary: finalSummary,
        raw_text_snippet: full_text.slice(0, 5000),
        chunk_summaries: chunkSummaries,
        num_pages: page_count,
        ocr_used,
        uploaded_at: new Date().toISOString(),
        content_hash: textHash,
      }),
      
      // Insert cache
      supabase.from("protocol_cache").insert({
        hash: textHash,
        summary: finalSummary,
        created_at: new Date().toISOString(),
      })
    ]);

    /* -------- DONE: return response -------- */
    return NextResponse.json({
      ok: true,
      protocolId,
      summary: finalSummary,
      pages: page_count,
      chunks: chunks.length,
      file_url: fileUrl,
      citations,
      sections,
    });
  } catch (err) {
    console.error("POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* -------------------- DELETE route -------------------- */
export async function DELETE(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const protocolId = body?.protocolId;
    
    if (!protocolId) {
      return NextResponse.json({ error: "protocolId required" }, { status: 400 });
    }

    // 1. Get protocol details
    const { data: proto, error: fetchError } = await supabase
      .from("protocols")
      .select("id, storage_key")
      .eq("id", protocolId)
      .maybeSingle();

    if (fetchError) {
      console.error("Fetch protocol error:", fetchError);
      return NextResponse.json({ 
        error: "Error fetching protocol", 
        details: fetchError.message 
      }, { status: 500 });
    }

    if (!proto) {
      return NextResponse.json({ error: "Protocol not found" }, { status: 404 });
    }

    // 2. Delete from storage (if exists)
    if (proto.storage_key) {
      const { error: storageError } = await supabase.storage
        .from("protocols")
        .remove([proto.storage_key]);
      
      if (storageError) {
        console.error("Storage delete error:", storageError);
      }
    }

    // 3. ✅ OPTIMIZATION: Delete child records in parallel (they don't depend on each other)
    const [metricsResult, chunksResult, summariesResult] = await Promise.all([
      supabase.from("ai_metrics").delete().eq("protocol_id", protocolId),
      supabase.from("protocol_chunks").delete().eq("protocol_id", protocolId),
      supabase.from("protocol_summaries").delete().eq("protocol_id", protocolId)
    ]);

    // Check for errors
    if (metricsResult.error) {
      console.error("Delete metrics error:", metricsResult.error);
      return NextResponse.json({ 
        error: "Failed to delete AI metrics", 
        details: metricsResult.error.message 
      }, { status: 500 });
    }

    if (chunksResult.error) {
      console.error("Delete chunks error:", chunksResult.error);
      return NextResponse.json({ 
        error: "Failed to delete protocol chunks", 
        details: chunksResult.error.message 
      }, { status: 500 });
    }

    if (summariesResult.error) {
      console.error("Delete summaries error:", summariesResult.error);
      return NextResponse.json({ 
        error: "Failed to delete protocol summaries", 
        details: summariesResult.error.message 
      }, { status: 500 });
    }

    // 4. Finally delete the main protocol record
    const { error: protocolError } = await supabase
      .from("protocols")
      .delete()
      .eq("id", protocolId);

    if (protocolError) {
      console.error("Delete protocol error:", protocolError);
      return NextResponse.json({ 
        error: "Failed to delete protocol", 
        details: protocolError.message 
      }, { status: 500 });
    }

    console.log(`✅ Successfully deleted protocol ${protocolId}`);
    return NextResponse.json({ ok: true, protocolId });
    
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json({ 
      error: "Delete operation failed", 
      details: String(err) 
    }, { status: 500 });
  }
}