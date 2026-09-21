# EduBot — Claude Code Project Kickoff

> Paste this as your first message to Claude Code in an empty project folder. It gives Claude Code everything it needs to start building EduBot without you re-explaining the proposal every session.

## 1. What this project is

EduBot is a full-stack, AI-powered adaptive learning platform — a Final Year Project (Software Engineering, Sunway University). It turns a student's own uploaded PDF (textbook chapter or lecture slides) into:
- a concise, source-grounded study summary
- a 10–20 question adaptive MCQ quiz generated directly from that PDF

The CP1 proposal has already been written and approved by the supervisor (Dr Hadyan Hafizh). This is the implementation phase — **build exactly what the proposal describes**. The written system architecture, database design, and methodology are what the finished system gets evaluated against.

## 2. What the four features must actually do (RQ → Objective → Feature)

| RQ | Objective | What to build |
|---|---|---|
| RQ1 | O1 | RAG pipeline: PDF upload → text extraction → chunking → embedding → indexed storage → source-grounded summary generation |
| RQ2 | O2 | RAG-grounded MCQ generator: 10–20 questions per quiz, every question traceable to the exact source chunk it came from, minimal hallucination |
| RQ3 | O3 | Adaptive difficulty engine: adjusts question difficulty in real time based on rolling quiz performance |
| RQ4 | O4 | A single, low-friction Tailwind UI that ties all three together with minimal cognitive load |

## 3. Tech stack (fixed — matches the proposal, don't substitute)

- **Framework:** Next.js (App Router), React, TypeScript
- **Styling:** Tailwind CSS
- **Auth:** Clerk (email/password + OAuth)
- **File storage:** Vercel Blob (PDF uploads)
- **Database:** MongoDB (Atlas) — also use **Atlas Vector Search** for chunk embeddings, so there's one database instead of a separate vector store
- **AI:** OpenAI API — `gpt-4o-mini` for summarization/MCQ generation, `text-embedding-3-small` for chunk/query embeddings

## 4. System architecture (4 layers, proposal §3.3)

1. **Presentation layer** — Next.js/React pages, Tailwind UI
2. **Application layer** — Next.js API routes (upload, extract, chunk, retrieve, generate, quiz logic)
3. **External AI layer** — OpenAI GPT-4o-mini (generation) + embedding model (retrieval)
4. **Data layer** — MongoDB (documents, chunks, summaries, quizzes) + Vercel Blob (raw PDFs)

## 5. Database schema — 7 collections (proposal §3.6 ERD)

- **User** — Clerk-linked identity
- **Document** — one per uploaded PDF; owner (User), Blob URL, filename, upload date, page count
- **Chunk** — belongs to a Document; chunk text, position/index, source page, embedding vector
- **Summary** — belongs to a Document; generated study notes, each point tagged with its source Chunk id
- **Quiz** — belongs to a Document; question count (10–20), created date
- **Question** — belongs to a Quiz; stem, options, correct answer, difficulty level, source Chunk id (traceability)
- **QuizAttempt** — belongs to a User + Quiz; per-question responses, running score, final difficulty level reached, timestamp

Relationships: a User owns many Documents. A Document produces many Chunks, Summaries, and Quizzes. A Quiz contains many Questions, each grounded in one Chunk. A QuizAttempt records one full run through a Quiz.

## 6. RAG pipeline — exact parameters (proposal §3.4.1–3.4.2)

**Upload & extraction**
- PDF → Vercel Blob, mapped to the user's Clerk ID
- Extract raw text, strip formatting noise

**Chunking**
- Recursive, structure-aware splitter: prefer breaking on paragraph → line → sentence boundaries
- Target chunk size: ~500 words (≈400–600 tokens)
- Overlap between consecutive chunks: 10–15%
- Every chunk stores a reference to its source document + position (required for citation traceability)

**Embedding & retrieval**
- Embed each chunk at indexing time with `text-embedding-3-small`
- Embed the user's request (summary/quiz instruction) with the same model, same vector space
- Retrieve via cosine similarity, top-k with **k ≈ 4–6** (make this tunable)
- Only retrieved chunks go into the LLM prompt — this is what enforces grounding and keeps hallucination down
- Start with per-document similarity search in MongoDB; add an Atlas Vector Search index if/when latency becomes an issue

**Generation**
- Prompt GPT-4o-mini with the retrieved chunks + an instruction to return structured JSON (summary points or MCQs)
- Parse the JSON response; tag every output unit (summary point or question) with its source chunk id for citation display

## 7. Adaptive difficulty mechanism (proposal §3.5)

- Every quiz starts at **medium** difficulty
- After each answer, update a rolling performance score
- Target band: **70–85% correct**
  - Above the band → increase difficulty (more plausible distractors, higher Bloom's-taxonomy level)
  - Below the band → decrease difficulty (simpler recall-level items)
  - Within the band → hold difficulty constant
- Record the final difficulty level reached on the QuizAttempt

## 8. Core use cases (proposal §3.7)

Register/sign in (Clerk) → Upload a PDF → Generate a study summary → Generate & attempt an adaptive quiz → View score + explanations → Verify source citations → Review past quiz history

## 9. Constraints — don't build past these

- **English-language PDFs only**
- **Max 50 MB per upload**
- **Standard digital text PDFs only** — reject scanned/image-only PDFs with no OCR text layer, and handwritten notes
- **Row-level data isolation**: a user can only ever see their own Documents, Summaries, and Quizzes — enforce this at the query level using the Clerk auth token, not just in the UI
- **No blocking UI**: PDF processing and generation are async. Show loading states like "Extracting text…" / "Generating questions…" instead of freezing the page
- **Every AI output must be traceable**: every summary point and every MCQ carries a citation to its source chunk, and the UI shows a permanent disclaimer that AI-generated content is a formative study aid, not a replacement for course materials

## 10. Build order (suggested phasing)

1. Scaffold Next.js (TypeScript, App Router) + Tailwind, set up the repo
2. Wire up Clerk auth (sign-up/sign-in, protected routes/middleware)
3. Define the 7 MongoDB collections/schemas above
4. Build PDF upload → Vercel Blob → Document record
5. Build text extraction + chunking (§6 params above) → store Chunks + embeddings
6. Build retrieval (top-k cosine similarity) + summary generation endpoint, with citations
7. Build MCQ generation endpoint (10–20 Qs, grounded, citations)
8. Build the adaptive difficulty logic on top of QuizAttempt
9. Build the frontend: dashboard, upload flow, summary view, quiz-taking flow (live difficulty + citations), quiz history
10. Add async/loading states everywhere per §9
11. Wire up error handling for oversized/non-English/scanned PDFs (reject with a clear message, per §9)

## 11. Environment variables you'll need

```
MONGODB_URI=
OPENAI_API_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
BLOB_READ_WRITE_TOKEN=
```

## 12. Working agreement

- This implementation needs to match the CP1 proposal's methodology — if you (Claude Code) want to deviate from anything in sections 3–10 above (e.g. swap MongoDB for another DB, change the chunking strategy), flag it and ask first, since the written proposal is what the built system gets evaluated against.
- Ask before installing new dependencies.
- Save this file as `docs/PROJECT_SPEC.md` in the repo, and reference it from `CLAUDE.md` so future sessions don't lose this context.
- Start with step 1 of the build order above and confirm the scaffold runs before moving on to step 2.
