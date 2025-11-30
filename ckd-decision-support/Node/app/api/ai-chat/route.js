import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const supabaseAuthClient = (token) =>
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- Embedding helper ---
async function embeddingFromText(text) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

// --- Model selector ---
function chooseModel(q) {
  // Use GPT-4o-mini for all — more context-aware, richer answers
  const complex = /dialysis|stage\s*[4-5]|transplant|contraindication/i.test(q);
  return complex ? "gpt-4o-mini" : "gpt-4o-mini";
}

export async function POST(req) {
  try {
    // --- Auth verification ---
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token)
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

    const supabaseUserClient = supabaseAuthClient(token);
    const { data: userResp, error: userErr } = await supabaseUserClient.auth.getUser();
    if (userErr || !userResp?.user)
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    const user = userResp.user;

    // --- Parse request ---
    const body = await req.json();
    const { question, protocol_id, level_of_facility } = body;
    if (!question)
      return NextResponse.json({ error: "Missing question text" }, { status: 400 });

    // --- Embedding + RAG search ---
    const safeQuestion = question.slice(0, 1000);
    const queryEmbedding = await embeddingFromText(safeQuestion);

        const { data: chunks, error: chunkErr } = await supabaseServer.rpc("match_protocol_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5,
    });

    // --- Handle missing or empty context gracefully ---
    let retrievedContext = "";
    if (!chunkErr && chunks?.length > 0) {
      //retrievedContext = chunks.map((c) => c.content).join("\n\n");
      retrievedContext = chunks
  .map(
    (c) =>
      `Section: ${c.section_title || "N/A"} (p.${c.page_number || "?"})\n${c.content}`
  )
  .join("\n\n");

    } else if (chunkErr) {
      console.warn("⚠️ Supabase RPC error:", chunkErr.message);
      retrievedContext = "No protocol context found due to a database RPC error.";
    } else {
      retrievedContext =
        "No matching protocol context found. Proceeding using Ghana CKD base guidelines.";
    }


    // --- Build AI prompt ---
    const prompt = `
You are a CKD clinical assistant referencing Ghana’s Ministry of Health CKD protocol.

Relevant protocol sections:
${retrievedContext || "No matching sections found."}

Clinician question:
"${safeQuestion}"

Respond concisely and factually based on Ghana’s CKD guideline.
If uncertain, reply: "This information is not explicitly stated in the Ghana CKD protocol."
`;

    // --- Choose model ---
    let model = chooseModel(question);
    let aiResp;

    try {
      console.log(`🧠 Attempting model: ${model}`);
      aiResp = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_completion_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "You are a CKD clinical decision-support assistant grounded in Ghana CKD guidelines. Respond in concise paragraphs or bullet points when appropriate.",
          },
          { role: "user", content: prompt },
        ],
      });
    } catch (err) {
      console.warn("⚠️ Primary model unavailable, retrying with GPT-4o-mini...");
      model = "gpt-4o-mini";
      aiResp = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_completion_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "You are a CKD clinical decision-support assistant grounded in Ghana CKD guidelines. Respond in concise paragraphs or bullet points when appropriate.",
          },
          { role: "user", content: prompt },
        ],
      });
    }

    // --- Safe output handling ---
    const raw = aiResp?.choices?.[0]?.message?.content?.trim() || "";
    if (!raw)
      return NextResponse.json(
        { success: false, error: "Empty model response" },
        { status: 502 }
      );

    // --- JSON validator / fallback parser ---
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = { answer: raw };
        }
      } else {
        parsed = { answer: raw };
      }
    }

    // --- Save chat log ---
    const { data: inserted, error: insertErr } = await supabaseServer
      .from("chat_logs")
      .insert([
        {
          user_id: user.id,
          question,
          answer: parsed.answer || raw,
          used_protocols: [protocol_id || "default-ghana-protocol"],
          model_used: model,
          facility_level: level_of_facility ?? null,
        },
      ])
      .select("id")
      .single();

    if (insertErr) console.error("⚠️ Chat log insert error:", insertErr.message);

    // --- Return clean JSON ---
    return NextResponse.json({
      success: true,
      data: {
        chat_id: inserted?.id ?? null,
        question,
        answer: parsed.answer || raw,
        retrieved_sections: chunks?.length || 0,
        model_used: model,
      },
    });
  } catch (err) {
    console.error("🚨 Chat route error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Unexpected AI chat error" },
      { status: 500 }
    );
  }
}