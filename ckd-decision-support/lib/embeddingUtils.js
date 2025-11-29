import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embeddingFromText(text) {
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return embedding.data[0].embedding;
}
