/**
 * Fully Corrected AI Recommendation Route (with Citation Links)
 * ---------------------------------------------------------------
 * This version ensures:
 * - STRICT JSON output
 * - Evidence entries include:
 *      section_title, page_number, excerpt, link
 * - link = `${NEXT_PUBLIC_APP_URL}/viewer?p=${page_number}`
 * - Never invents page numbers
 * - Compatible with your protocol_chunks, sections, embeddings workflow
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL; // 👈 CITATION BASE URL

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
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/* -------------------- Embedding Generation -------------------- */
async function embeddingFromText(text) {
  if (!text || !text.trim()) return null;
  try {
    const resp = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return resp?.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("Embedding generation error:", err);
    return null;
  }
}

/* -------------------- Normalize chunks -------------------- */
function normalizeChunks(rawChunks) {
  if (!Array.isArray(rawChunks)) return [];
  return rawChunks.map((c, idx) => {
    const content = (c.content ?? c.chunk_text ?? "") || "";
    const section_title = c.section_title || c.section || `Section ${idx + 1}`;
    const page_number = Number.isInteger(c.page_number) ? c.page_number : (c.page || null);

    const cleaned = String(content).replace(/\s+/g, " ").trim();
    const content_excerpt = cleaned.slice(0, CHUNK_EXCERPT_CHARS) + (cleaned.length > CHUNK_EXCERPT_CHARS ? "..." : "");

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
  if (!Array.isArray(sections) || sections.length === 0) return "No retrieved context found.";
  let out = "";
  for (const s of sections) {
    const block = `${s.section_title}${s.page_number ? ` (p.${s.page_number})` : ""}\n${s.content_excerpt}\n\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out.trim() || "No retrieved context found.";
}

/* -------------------- Section Loading -------------------- */
async function loadProtocolSections(protocolId) {
  if (!protocolId) return [];
  try {
    const { data, error } = await supabaseServer
      .from("protocols")
      .select("sections, section_embeddings")
      .eq("id", protocolId)
      .maybeSingle();

    if (error) {
      console.warn("loadProtocolSections error:", error);
      return [];
    }

    const sections = data?.sections || [];
    const sectionEmb = data?.section_embeddings || null;

    if (Array.isArray(sectionEmb) && sectionEmb.length > 0 && sectionEmb[0]?.embedding) {
      return sectionEmb.map((s) => ({ title: s.title, embedding: s.embedding }));
    }

    if (Array.isArray(sectionEmb) && sections.length === sectionEmb.length) {
      return sections.map((t, i) => ({ title: t, embedding: sectionEmb[i] }));
    }

    return sections.map((t) => ({ title: t, embedding: null }));
  } catch (err) {
    console.warn("Failed to load protocol sections:", err?.message || err);
    return [];
  }
}

/* -------------------- Persist Section Embeddings -------------------- */
async function persistSectionEmbeddings(protocolId, sectionsWithEmbeddings) {
  if (!protocolId || !Array.isArray(sectionsWithEmbeddings) || sectionsWithEmbeddings.length === 0) return;
  try {
    await supabaseServer
      .from("protocols")
      .update({ section_embeddings: sectionsWithEmbeddings })
      .eq("id", protocolId);
  } catch (err) {
    console.warn("persistSectionEmbeddings failed:", err?.message || err);
  }
}

/* -------------------- Boost by Section -------------------- */
async function boostChunksBySection(queryEmbedding, retrieved, protocolSections = []) {
  if (!queryEmbedding || !Array.isArray(retrieved) || retrieved.length === 0)
    return retrieved.slice(0, MAX_CONTEXT_CHUNKS);

  const sections = (protocolSections || []).map((s) => ({ title: s.title, embedding: s.embedding }));
  const hasSectionEmbeddings = sections.some((s) => Array.isArray(s.embedding));

  const scored = await Promise.all(
    retrieved.map(async (r) => {
      let chunkEmb = r.embedding;

      if (!chunkEmb) {
        try {
          chunkEmb = await embeddingFromText(r.content_excerpt || (r.content || "").slice(0, 300));
        } catch {
          chunkEmb = null;
        }
      }

      const contentScore = chunkEmb ? cosine(queryEmbedding, chunkEmb) : 0;

      let sectionScore = 0;
      if (hasSectionEmbeddings && r.section_title) {
        const match = sections.find(
          (s) => (s.title || "").toLowerCase() === (r.section_title || "").toLowerCase()
        );
        if (match?.embedding) {
          sectionScore = cosine(queryEmbedding, match.embedding);
        } else {
          sectionScore = sections.reduce((acc, s) => {
            if (!s.embedding) return acc;
            const c = cosine(queryEmbedding, s.embedding);
            return c > acc ? c : acc;
          }, 0);
        }
      }

      const boosted = contentScore + SECTION_WEIGHT * sectionScore;

      return {
        ...r,
        _content_score: contentScore,
        _section_score: sectionScore,
        _boosted_score: boosted,
      };
    })
  );

  scored.sort((a, b) => {
    const diff = b._boosted_score - a._boosted_score;
    if (Math.abs(diff) > 1e-6) return diff;
    return (b._content_score || 0) - (a._content_score || 0);
  });

  return scored.slice(0, MAX_CONTEXT_CHUNKS);
}

/* -------------------- JSON Extractor -------------------- */
function extractJSONFromText(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
  }
  return null;
}

/* -------------------- MAIN ROUTE -------------------- */
export async function POST(req) {
  const startTime = Date.now();

  try {
    /* -------------------- Auth -------------------- */
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUserClient = createSupabaseUserClient(token);
    const { data: userResp, error: userErr } = await supabaseUserClient.auth.getUser();
    if (userErr || !userResp?.user) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    }
    const user = userResp.user;

    /* -------------------- Role Check -------------------- */
    const { data: profile, error: profileErr } = await supabaseServer
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile || !["clinician", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    /* -------------------- Parse Body -------------------- */
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
    let protocolSummary = "";
    let protocol = null;

    try {
      if (protocol_id) {
        const { data } = await supabaseServer
          .from("protocols")
          .select("id, name, version, protocol_summaries, sections, section_embeddings")
          .eq("id", protocol_id)
          .maybeSingle();
        protocol = data || null;
      } else {
        const { data } = await supabaseServer
          .from("protocols")
          .select("id, name, version, protocol_summaries, sections, section_embeddings")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        protocol = data || null;
      }

      if (protocol) {
        protocolSummary = `${protocol.name || ""} ${protocol.version || ""}\n\n${protocol.protocol_summaries || ""}`.trim();
      }
    } catch {}

    /* -------------------- Facility Context -------------------- */
    let investigationsContext = "";
    const lvl = (level_of_facility || "").toLowerCase();

    if (lvl.includes("without a doctor")) {
      investigationsContext = `At CHPS compounds, Health Centers, and clinics (without a doctor)...`;
    } else if (lvl.includes("with a doctor")) {
      investigationsContext = `At Clinics, Polyclinics, and Hospitals (with a doctor)...`;
    } else if (lvl.includes("specialist")) {
      investigationsContext = `At Regional or Tertiary Hospitals (Specialist level)...`;
    }

    /* -------------------- Build Query Embedding -------------------- */
    const queryText = `CKD Stage ${stage ?? "N/A"}, eGFR ${egfr}, Diabetes ${
      diabetes ? "Yes" : "No"
    }, Hypertension ${hypertension ? "Yes" : "No"}. Facility: ${level_of_facility}`;

    const queryEmbedding = await embeddingFromText(queryText);
    if (!queryEmbedding) {
      return NextResponse.json({ error: "Failed to generate query embedding" }, { status: 500 });
    }

    /* -------------------- Match Protocol Chunks -------------------- */
    let chunks = [];

    try {
      const rpcResp = await supabaseServer.rpc("match_protocol_chunks", {
        query_embedding: queryEmbedding,
        match_threshold: 0.72,
        match_count: DEFAULT_RANK_COUNT,
      });

      if (Array.isArray(rpcResp?.data)) {
        chunks = rpcResp.data;
      }
    } catch (err) {
      console.warn("match_protocol_chunks RPC error:", err);
    }

    /* -------------------- Fallback to Direct Fetch -------------------- */
    if (!Array.isArray(chunks) || chunks.length === 0) {
      const fallback = await supabaseServer
        .from("protocol_chunks")
        .select("id, protocol_id, chunk_index, content, embedding, section_title, page_number")
        .eq("protocol_id", protocol?.id || 0)
        .limit(50);

      if (!fallback.error && Array.isArray(fallback.data)) {
        chunks = fallback.data;
      }
    }

    /* -------------------- Normalize -------------------- */
    let retrievedSections = normalizeChunks(chunks);

    /* -------------------- Section Embeddings -------------------- */
    let protoSections = protocol ? await loadProtocolSections(protocol.id) : [];

    const missingEmbeddings =
      protoSections.length > 0 && protoSections.some((s) => !s.embedding);

    if (missingEmbeddings) {
      const embeddings = await Promise.all(
        protoSections.map((s) => embeddingFromText(s.title))
      );
      const updated = protoSections.map((s, i) => ({
        title: s.title,
        embedding: embeddings[i] || null,
      }));
      persistSectionEmbeddings(protocol.id, updated);
      protoSections = updated;
    }

    /* -------------------- Boost Ranking -------------------- */
    retrievedSections = await boostChunksBySection(
      queryEmbedding,
      retrievedSections,
      protoSections
    );

    /* -------------------- Construct LLM Context -------------------- */
    const trimmedContext = joinRetrievedContext(retrievedSections, 2500);
    const model = chooseModel();

    /* -------------------- System Prompt (Corrected) -------------------- */
    const systemContent = `
You are a CKD clinical decision-support assistant for Ghana’s Ministry of Health.

Your output MUST BE STRICT JSON ONLY — no Markdown, no commentary.

When citing protocol evidence:
- Use ONLY sections supplied in the "Retrieved Context".
- For each evidence item, include exactly:

{
  "section_title": "...",
  "page_number": <number or null>,
  "excerpt": "...",
  "link": "<APP_URL>/viewer?p=<page_number>"
}

Where:
- APP_URL = "${APP_URL}"
- If page_number is null or missing, set link = null.
- NEVER invent page numbers.
- NEVER fabricate citations.
`;

    /* -------------------- User Prompt (Citation instructions added) -------------------- */
    const userPrompt = `
Local Protocol Summary:
${protocolSummary || "No local protocol provided."}

Retrieved Context:
${trimmedContext}

Facility Context:
${investigationsContext}

Patient:
- Age: ${age ?? "N/A"}
- eGFR: ${egfr}
- CKD Stage: ${stage ?? "N/A"}
- Diabetes: ${diabetes ? "Yes" : "No"}
- Hypertension: ${hypertension ? "Yes" : "No"}
- Facility Level: ${level_of_facility}

IMPORTANT — When constructing evidence entries:
- Use the REAL page_number from the retrieved context.
- Create link = "${APP_URL}/viewer?p=" + page_number.
- If page_number is null, set link = null.

Return STRICT JSON in this structure:

{
  "recommendation": "string",
  "suggested_investigations": ["..."],
  "suggested_treatment": ["..."],
  "rationale": "string",
  "evidence": [
    {
      "section_title": "...",
      "page_number": <num or null>,
      "excerpt": "...",
      "link": "string or null"
    }
  ]
}
`;

    /* -------------------- Call OpenAI -------------------- */
    const aiResp = await openai.responses.create({
      model,
      input: [
        { role: "system", content: systemContent },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.15,
      max_output_tokens: 900,
    });

    /* -------------------- Extract Raw JSON -------------------- */
    let rawText = "";

    if (aiResp.output && Array.isArray(aiResp.output)) {
      rawText = aiResp.output
        .map((o) => {
          if (typeof o === "string") return o;
          if (Array.isArray(o.content)) {
            return o.content.map((c) => c?.text || "").join("");
          }
          if (o.content?.text) return o.content.text;
          return "";
        })
        .join("\n")
        .trim();
    }

    rawText ||= aiResp.output_text ?? "";

    /* -------------------- Ensure JSON -------------------- */
    let parsed = extractJSONFromText(rawText);

    if (!parsed) {
      parsed = {
        recommendation: "No recommendation produced.",
        suggested_investigations: [],
        suggested_treatment: [],
        rationale: "",
        evidence: [],
      };
    }

    parsed.recommendation ||= "No specific recommendation.";
    parsed.suggested_investigations = Array.isArray(parsed.suggested_investigations)
      ? parsed.suggested_investigations.filter(Boolean)
      : [];
    parsed.suggested_treatment = Array.isArray(parsed.suggested_treatment)
      ? parsed.suggested_treatment.filter(Boolean)
      : [];
    parsed.rationale ||= "";
    parsed.evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];

    /* -------------------- Cache -------------------- */
    const promptKey = [
      protocolSummary || "",
      retrievedSections
        .map((s) => `${s.section_title} (p.${s.page_number}) - ${s.content_excerpt}`)
        .join("\n"),
      queryText,
    ].join("\n\n");

    const promptHash = sha256Hex(promptKey);

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
          citations: retrievedSections.map((r) => r.section_title).slice(0, 10),
          model_used: model,
          prompt_hash: promptHash,
          top_sections: retrievedSections
            .map((r) => ({ title: r.section_title, score: r._section_score || 0 }))
            .slice(0, 6),
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {}

    /* -------------------- Final Response -------------------- */
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
      { error: err?.message || "Unexpected AI recommendation error" },
      { status: 500 }
    );
  }
}
