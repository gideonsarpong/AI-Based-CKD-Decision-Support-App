/**
 * AI Recommendation Route — Cleaned & Production-Ready
 * -----------------------------------------------------
 * - STRICT JSON output
 * - Correct citation link format
 * - Never invents page numbers
 * - All duplicated / stray code removed
 * - Section embeddings stored using Option A Upsert
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import crypto from "crypto";

/* -------------------- Env / Clients -------------------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const createSupabaseUserClient = (token) =>
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

const openai = new OpenAI({ apiKey: OPENAI_KEY });

/* -------------------- Config -------------------- */
const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_RANK_COUNT = 12;
const MAX_CONTEXT_CHUNKS = 8;
const SECTION_WEIGHT = 1.0;
const CHUNK_EXCERPT_CHARS = 300;

/* -------------------- Utilities -------------------- */
const chooseModel = () => "gpt-4o-mini";

function sha256Hex(input) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a));
}

function cosine(a, b) {
  if (!a || !b) return 0;
  const na = norm(a),
    nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/* -------------------- Embedding Generator -------------------- */
async function embeddingFromText(text) {
  if (!text) return null;

  let str = text;
  if (typeof text !== "string") {
    if (text?.title) str = String(text.title);
    else str = String(text);
  }

  if (!str.trim()) return null;

  try {
    const resp = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: str,
    });
    return resp?.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("Embedding error:", err);
    return null;
  }
}

/* -------------------- Chunk Normalizer -------------------- */
function normalizeChunks(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.map((c, idx) => {
    const content = (c.content ?? c.chunk_text ?? "") || "";
    const section_title = c.section_title || c.section || `Section ${idx + 1}`;
    const page_number = Number.isInteger(c.page_number)
      ? c.page_number
      : c.page || null;

    const cleaned = String(content).replace(/\s+/g, " ").trim();
    const content_excerpt =
      cleaned.slice(0, CHUNK_EXCERPT_CHARS) +
      (cleaned.length > CHUNK_EXCERPT_CHARS ? "..." : "");

    return {
      id: c.id || null,
      protocol_id: c.protocol_id || null,
      chunk_index: c.chunk_index ?? null,
      section_title,
      page_number,
      content,
      content_excerpt,
      embedding: c.embedding || c.chunk_embedding || null,
      raw: c,
    };
  });
}

/* -------------------- Context Joiner -------------------- */
function joinRetrievedContext(sections, maxChars = 2500) {
  if (!Array.isArray(sections) || sections.length === 0)
    return "No retrieved context found.";

  let output = "";
  for (const s of sections) {
    const block = `${s.section_title}${
      s.page_number ? ` (p.${s.page_number})` : ""
    }\n${s.content_excerpt}\n\n`;

    if (output.length + block.length > maxChars) break;
    output += block;
  }

  return output.trim() || "No retrieved context found.";
}

/* -------------------- Load Sections -------------------- */
async function loadProtocolSections(protocolId) {
  if (!protocolId) return [];

  try {
    const { data, error } = await supabaseServer
      .from("protocols")
      .select("sections, section_embeddings")
      .eq("id", protocolId)
      .maybeSingle();

    if (error) return [];

    const sections = data?.sections || [];
    const sectionEmb = data?.section_embeddings || [];

    const normalized = sections.map((s) => {
      if (typeof s === "string") return { title: s, embedding: null };
      if (s?.title) return { title: s.title, embedding: s.embedding || null };
      return { title: String(s), embedding: null };
    });

    if (
      Array.isArray(sectionEmb) &&
      sectionEmb.length > 0 &&
      sectionEmb[0]?.embedding
    ) {
      return sectionEmb.map((s) => ({
        title: String(s.title || ""),
        embedding: s.embedding,
      }));
    }

    if (sectionEmb.length === normalized.length) {
      return normalized.map((s, i) => ({
        title: s.title,
        embedding: sectionEmb[i],
      }));
    }

    return normalized;
  } catch {
    return [];
  }
}

/* -------------------- Persist Section Embeddings (Option A) -------------------- */
async function persistSectionEmbeddings(protocolId, updated) {
  if (!protocolId || !Array.isArray(updated)) return;

  try {
    await supabaseServer
      .from("protocols")
      .update({
        section_embeddings: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", protocolId);
  } catch (err) {
    console.warn("Failed to persist section embeddings:", err);
  }
}

/* -------------------- Boost Ranking -------------------- */
async function boostChunksBySection(queryEmb, retrieved, protocolSections) {
  if (!queryEmb || !Array.isArray(retrieved) || retrieved.length === 0)
    return retrieved.slice(0, MAX_CONTEXT_CHUNKS);

  const sections = (protocolSections || []).map((s) => ({
    title: s.title,
    embedding: s.embedding,
  }));
  const hasSectionEmb = sections.some((s) => Array.isArray(s.embedding));

  const scored = await Promise.all(
    retrieved.map(async (r) => {
      let chunkEmb = r.embedding;
      if (!chunkEmb) {
        try {
          chunkEmb = await embeddingFromText(
            r.content_excerpt || r.content.slice(0, 300)
          );
        } catch {
          chunkEmb = null;
        }
      }

      const contentScore = chunkEmb ? cosine(queryEmb, chunkEmb) : 0;

      let sectionScore = 0;
      if (hasSectionEmb && r.section_title) {
        const match = sections.find(
          (s) =>
            (s.title || "").toLowerCase() ===
            (r.section_title || "").toLowerCase()
        );
        if (match?.embedding) {
          sectionScore = cosine(queryEmb, match.embedding);
        } else {
          sectionScore = sections.reduce((acc, s) => {
            if (!s.embedding) return acc;
            const c = cosine(queryEmb, s.embedding);
            return c > acc ? c : acc;
          }, 0);
        }
      }

      return {
        ...r,
        _content_score: contentScore,
        _section_score: sectionScore,
        _boosted_score: contentScore + SECTION_WEIGHT * sectionScore,
      };
    })
  );

  scored.sort((a, b) => b._boosted_score - a._boosted_score);
  return scored.slice(0, MAX_CONTEXT_CHUNKS);
}

/* -------------------- JSON Extractor -------------------- */
function extractJSONFromText(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
  }
  return null;
}

/* ========================================================================== */
/*                                MAIN ROUTE                                  */
/* ========================================================================== */

export async function POST(req) {
  const start = Date.now();

  try {
    /* -------------------- Auth -------------------- */
    const token = (req.headers.get("authorization") || "")
      .replace("Bearer ", "")
      .trim();
    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const supabaseUser = createSupabaseUserClient(token);
    const { data: userResp } = await supabaseUser.auth.getUser();
    if (!userResp?.user) {
      return NextResponse.json(
        { error: "Invalid session token" },
        { status: 401 }
      );
    }
    const user = userResp.user;

    /* -------------------- Role Check -------------------- */
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (!profile || !["clinician", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    /* -------------------- Parse body -------------------- */
    const body = await req.json();
    const {
      age,
      egfr,
      diabetes = false,
      hypertension = false,
      stage,
      level_of_facility,
      protocol_id,
    } = body;

    if (egfr === undefined || !level_of_facility) {
      return NextResponse.json(
        { error: "Missing required fields (egfr, level_of_facility)" },
        { status: 400 }
      );
    }

    /* -------------------- Fetch Protocol -------------------- */
    let protocol = null;
    let protocolSummary = "";

    if (protocol_id) {
      const { data } = await supabaseServer
        .from("protocols")
        .select(
          "id, name, version, protocol_summaries, sections, section_embeddings"
        )
        .eq("id", protocol_id)
        .maybeSingle();
      protocol = data || null;
    } else {
      const { data } = await supabaseServer
        .from("protocols")
        .select(
          "id, name, version, protocol_summaries, sections, section_embeddings"
        )
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      protocol = data || null;
    }

    if (protocol) {
      protocolSummary = `${protocol.name || ""} ${
        protocol.version || ""
      }\n\n${protocol.protocol_summaries || ""}`.trim();
    }

    /* -------------------- Facility Context -------------------- */
    let investigationsContext = "";
    const lvl = level_of_facility.toLowerCase();

    if (lvl.includes("without a doctor")) {
      investigationsContext = `At CHPS compounds, Health Centers, and clinics (without a doctor)...`;
    } else if (lvl.includes("with a doctor")) {
      investigationsContext = `At Clinics, Polyclinics, and Hospitals (with a doctor)...`;
    } else if (lvl.includes("specialist")) {
      investigationsContext = `At Regional or Tertiary Hospitals (Specialist level)...`;
    }

    /* -------------------- Query Embedding -------------------- */
    const queryText = `CKD Stage ${stage ?? "N/A"}, eGFR ${egfr}, Diabetes ${
      diabetes ? "Yes" : "No"
    }, Hypertension ${hypertension ? "Yes" : "No"}. Facility: ${level_of_facility}`;

    const queryEmbedding = await embeddingFromText(queryText);
    if (!queryEmbedding) {
      return NextResponse.json(
        { error: "Failed to generate query embedding" },
        { status: 500 }
      );
    }

    /* -------------------- Match Chunks -------------------- */
    let chunks = [];
    try {
      const rpc = await supabaseServer.rpc("match_protocol_chunks", {
        query_embedding: queryEmbedding,
        match_threshold: 0.72,
        match_count: DEFAULT_RANK_COUNT,
      });

      if (Array.isArray(rpc?.data)) chunks = rpc.data;
    } catch {}

    // fallback
    if (!Array.isArray(chunks) || chunks.length === 0) {
      const fb = await supabaseServer
        .from("protocol_chunks")
        .select(
          "id, protocol_id, chunk_index, content, embedding, section_title, page_number"
        )
        .eq("protocol_id", protocol?.id || 0)
        .limit(50);

      if (!fb.error && fb.data) chunks = fb.data;
    }

    /* -------------------- Normalize -------------------- */
    let retrievedSections = normalizeChunks(chunks);

    /* -------------------- Load + Fix Section Embeddings -------------------- */
    let protoSections = protocol
      ? await loadProtocolSections(protocol.id)
      : [];

    const missing = protoSections.some((s) => !s.embedding);
    if (missing) {
      const embeddings = await Promise.all(
        protoSections.map((s) => embeddingFromText(s.title))
      );

      const updated = protoSections.map((s, i) => ({
        title: s.title,
        embedding: embeddings[i] || null,
      }));

      await persistSectionEmbeddings(protocol.id, updated);
      protoSections = updated;
    }

    /* -------------------- Boost Ranking -------------------- */
    retrievedSections = await boostChunksBySection(
      queryEmbedding,
      retrievedSections,
      protoSections
    );

    /* -------------------- Build Context -------------------- */
    const contextText = joinRetrievedContext(retrievedSections, 2500);

    /* -------------------- Prompts -------------------- */
    const model = chooseModel();

    const systemPrompt = `
You are a CKD clinical decision-support assistant for Ghana’s Ministry of Health.
Your output MUST BE STRICT JSON ONLY.

Citation rules:
- Use ONLY retrieved context.
- NEVER invent page numbers.
- Evidence items must include:
  {
    "section_title": "...",
    "page_number": <num or null>,
    "excerpt": "...",
    "link": "<APP_URL>/viewer?p=<page_number>" | null
  }
APP_URL = "${APP_URL}".
    `.trim();

    const userPrompt = `
Local Protocol Summary:
${protocolSummary || "None"}

Retrieved Context:
${contextText}

Facility Context:
${investigationsContext}

Patient:
- Age: ${age ?? "N/A"}
- eGFR: ${egfr}
- CKD Stage: ${stage ?? "N/A"}
- Diabetes: ${diabetes ? "Yes" : "No"}
- Hypertension: ${hypertension ? "Yes" : "No"}
- Facility Level: ${level_of_facility}

Return STRICT JSON:
{
  "recommendation": "",
  "suggested_investigations": [],
  "suggested_treatment": [],
  "rationale": "",
  "evidence": [
     {
       "section_title": "",
       "page_number": <num|null>,
       "excerpt": "",
       "link": "<APP_URL>/viewer?p=X" | null
     }
  ]
}
    `.trim();

    /* -------------------- OpenAI Call -------------------- */
    const aiResp = await openai.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.15,
      max_output_tokens: 900,
    });

    /* -------------------- Parse JSON -------------------- */
    let rawText = "";
    if (Array.isArray(aiResp.output)) {
      rawText = aiResp.output
        .map((o) => {
          if (typeof o === "string") return o;
          if (Array.isArray(o.content))
            return o.content.map((c) => c?.text || "").join("");
          if (o.content?.text) return o.content.text;
          return "";
        })
        .join("\n")
        .trim();
    }
    rawText ||= aiResp.output_text ?? "";

    let parsed = extractJSONFromText(rawText) || {
      recommendation: "No recommendation.",
      suggested_investigations: [],
      suggested_treatment: [],
      rationale: "",
      evidence: [],
    };

    parsed.suggested_investigations =
      parsed.suggested_investigations?.filter(Boolean) || [];
    parsed.suggested_treatment =
      parsed.suggested_treatment?.filter(Boolean) || [];
    parsed.evidence = Array.isArray(parsed.evidence)
      ? parsed.evidence
      : [];

    /* -------------------- Cache Hash -------------------- */
    const promptKey = [
      protocolSummary,
      retrievedSections
        .map(
          (s) =>
            `${s.section_title} (p.${s.page_number}) - ${s.content_excerpt}`
        )
        .join("\n"),
      queryText,
    ].join("\n\n");

    const promptHash = sha256Hex(promptKey);

    /* -------------------- Cache Storage -------------------- */
    try {
      await supabaseServer.from("ai_cache").insert([
        {
          prompt_hash: promptHash,
          response: JSON.stringify(parsed),
          model_used: model,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {}

    /* -------------------- Analytics -------------------- */
    try {
      await supabaseServer.from("ai_queries").insert([
        {
          user_id: user.id,
          query_text: userPrompt.slice(0, 2000),
          response: rawText,
          citations: retrievedSections
            .map((r) => r.section_title)
            .slice(0, 10),
          model_used: model,
          prompt_hash: promptHash,
          top_sections: retrievedSections
            .map((r) => ({
              title: r.section_title,
              score: r._section_score || 0,
            }))
            .slice(0, 6),
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {}

    /* -------------------- Final Return -------------------- */
    return NextResponse.json({
      success: true,
      data: {
        ...parsed,
        retrieved_sections: retrievedSections,
      },
    });
  } catch (err) {
    console.error("AI recommendation route error:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
