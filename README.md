# 🏥 AI-Based CKD Decision Support Application

An intelligent clinical decision support system for Chronic Kidney Disease (CKD) management in Ghana, powered by AI and designed to assist healthcare professionals at all facility levels.

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://ai-based-ckd-decision-support-app.vercel.app)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com/)

## 🌟 Overview

This application provides AI-powered clinical decision support for CKD management tailored to Ghana's healthcare system. It combines protocol-based guidance with semantic search capabilities to deliver context-aware treatment recommendations based on patient data, facility level, and local clinical protocols.
This project directly supports Ghana’s Digital Health Strategy objective of leveraging emerging technologies to improve clinical decision-making, quality of care, and data-driven health planning. By integrating locally developed clinical protocols with AI-assisted reasoning, the CKD Decision Support System demonstrates how artificial intelligence can be safely localized to Ghana’s clinical and regulatory context. The platform aligns with the Ministry of Health’s focus on interoperability, evidence-based practice, and responsible use of AI in healthcare. It serves as a model for how national protocols such as those for chronic kidney disease—can be transformed into intelligent, protocol-driven digital assistants that enhance clinician performance, standardize care delivery, and contribute to equitable access to specialized expertise across all levels of the health system.

### Key Features

- 🤖 **AI-Powered Recommendations** - GPT-4o Mini generates evidence-based treatment suggestions
- 📊 **CKD Staging Calculator** - Automatic staging based on eGFR and clinical parameters
- 📄 **Protocol Management** - Upload, manage, and search clinical protocols (PDF)
- 🔍 **Semantic Search** - Vector-based retrieval using embeddings for relevant protocol sections
- 🏥 **Facility-Aware Guidance** - Recommendations adapted to facility level (CHPS, Polyclinic, Specialist)
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile devices
- 🔐 **Role-Based Access** - Secure authentication with clinician and admin roles
- 📈 **Analytics Dashboard** - Track usage patterns and system performance

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- Next.js 14 (React)
- Tailwind CSS
- React Hot Toast
- PDF.js for document viewing

**Backend:**
- Next.js API Routes
- Python FastAPI (for PDF extraction)
- OpenAI API (GPT-4o Mini, text-embedding-3-small)

**Database & Storage:**
- Supabase (PostgreSQL)
- Vector embeddings (pgvector)
- Supabase Storage (PDF files)

**Key Technologies:**
- Semantic search with cosine similarity
- RAG (Retrieval Augmented Generation)
- Server-side PDF processing with OCR support

### System Architecture

```
┌─────────────────┐
│   Next.js App   │
│  (Client Side)  │
└────────┬────────┘
         │
         ├─────────────────────────────────┐
         │                                 │
┌────────▼────────┐              ┌────────▼────────┐
│   API Routes    │              │  Python API     │
│  (Next.js)      │◄────────────►│  (FastAPI)      │
└────────┬────────┘              └─────────────────┘
         │                              │
         │                              │ PDF Extraction
         │                              │ + OCR
         │
┌────────▼────────────────────────┐
│      Supabase Backend           │
│                                 │
│  ┌──────────┐  ┌─────────────┐ │
│  │PostgreSQL│  │   Storage   │ │
│  │ +pgvector│  │  (PDFs)     │ │
│  └──────────┘  └─────────────┘ │
└─────────────────────────────────┘
         │
┌────────▼────────┐
│   OpenAI API    │
│  - GPT-4o Mini  │
│  - Embeddings   │
└─────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- Supabase account
- OpenAI API key

### Environment Variables

Create a `.env.local` file in the root directory:

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Python API (for PDF extraction)
PY_API_URL=http://127.0.0.1:8000
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/gideonsarpong/AI-Based-CKD-Decision-Support-App.git
cd AI-Based-CKD-Decision-Support-App/ckd-decision-support
```

2. **Install Node.js dependencies**
```bash
npm install
```

3. **Set up Python API (for PDF extraction)**
```bash
cd python-api  # or wherever your Python API is located
pip install -r requirements.txt
```

4. **Set up Supabase database**

Run the following SQL to set up your database schema:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Protocols table
CREATE TABLE protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  original_filename TEXT,
  version TEXT,
  country TEXT,
  protocol_summaries TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  embedding VECTOR(1536),
  sections JSONB,
  section_embeddings JSONB,
  file_url TEXT,
  storage_key TEXT,
  chunks_count INTEGER,
  processing_time_ms INTEGER,
  citations JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Protocol chunks for semantic search
CREATE TABLE protocol_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  chunk_text TEXT,
  start_offset INTEGER,
  page_number INTEGER,
  section_title TEXT,
  embedding VECTOR(1536)
);

-- Create vector similarity search function
CREATE OR REPLACE FUNCTION match_protocol_chunks(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  protocol_id UUID,
  chunk_text TEXT,
  section_title TEXT,
  page_number INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id,
    pc.protocol_id,
    pc.chunk_text,
    pc.section_title,
    pc.page_number,
    1 - (pc.embedding <=> query_embedding) AS similarity
  FROM protocol_chunks pc
  WHERE 1 - (pc.embedding <=> query_embedding) > match_threshold
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

5. **Run the development servers**

Start the Next.js app:
```bash
npm run dev
```

Start the Python API (in a separate terminal):
```bash
python main.py  # or uvicorn main:app --reload
```

6. **Access the application**

Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Usage

### For Clinicians

1. **Sign in** with your credentials
2. **Enter patient data** - age, eGFR, comorbidities, facility level
3. **Get AI recommendations** - treatment, investigations, monitoring frequency
4. **Review evidence** - click citations to view relevant protocol sections
5. **Save/export** recommendations for patient records

### For Administrators

1. **Manage protocols** - upload new CKD management protocols (PDF)
2. **View analytics** - track system usage and performance
3. **Manage users** - add/remove clinician accounts
4. **Monitor AI queries** - review recommendation quality

## 🔧 Key Components

### Protocol Upload & Processing

- **Server-side processing** - PDFs never touch the client
- **OCR support** - extracts text from scanned documents
- **Automatic chunking** - splits protocols into searchable sections
- **Embedding generation** - creates vector embeddings for semantic search
- **Citation tracking** - maintains page-level references

### AI Recommendation Engine

- **Context retrieval** - fetches relevant protocol sections using vector search
- **Prompt engineering** - structured prompts ensure consistent output
- **Evidence grounding** - all recommendations linked to protocol sources
- **Facility adaptation** - adjusts guidance based on available resources

### Frontend Features

- **Real-time updates** - instant feedback during uploads
- **Debounced search** - optimized protocol filtering
- **Modal dialogs** - clean UX for summaries and confirmations
- **Toast notifications** - clear success/error messaging

## 🐛 Debugging

### Common Issues

**PDF Upload Fails:**
- Check Python API is running on correct port
- Verify PDF is under 50MB
- Ensure PDF is not password-protected

**AI Recommendations Empty:**
- Verify OpenAI API key is valid
- Check protocol chunks exist in database
- Review console logs for embedding errors

**Slow Performance:**
- Enable caching in production
- Optimize database indices
- Consider CDN for static assets

## 🔒 Security

- **Authentication** - Supabase Auth with JWT tokens
- **Authorization** - Role-based access control (RBAC)
- **Data encryption** - All data encrypted at rest and in transit
- **API rate limiting** - Prevents abuse
- **Input validation** - Server-side validation on all inputs
- **PHI protection** - No patient identifiable information in logs

## 📊 Database Schema

See the `Installation` section above for the complete schema. Key tables:

- `protocols` - Stores uploaded protocol metadata and embeddings
- `protocol_chunks` - Searchable protocol sections with embeddings
- `protocol_summaries` - AI-generated summaries
- `ai_queries` - Tracks AI recommendation requests
- `ai_metrics` - Performance and quality metrics
- `profiles` - User roles and permissions

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **Gideon Sarpong** - *Initial work* - [gideonsarpong](https://github.com/gideonsarpong)

## 🙏 Acknowledgments

- Ghana Ministry of Health for CKD management protocols
- OpenAI for GPT-4o Mini and embedding models
- Supabase for backend infrastructure
- Next.js and Vercel for deployment platform

## 📧 Contact

For questions or support, please open an issue on GitHub or contact the development team.

---

**Live Demo:** [https://ai-based-ckd-decision-support-app.vercel.app](https://ai-based-ckd-decision-support-app.vercel.app)

**Repository:** [https://github.com/gideonsarpong/AI-Based-CKD-Decision-Support-App](https://github.com/gideonsarpong/AI-Based-CKD-Decision-Support-App)

