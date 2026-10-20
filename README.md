# ClauseClear — AI Contract Explainer (MVP)

A Next.js + TypeScript MVP based on the supplied hackathon brief.

## MVP scope implemented
- Upload a text-based PDF (up to 4 MB, within Vercel Functions' request-body limit)
- Extract selectable PDF text and create numbered clauses
- Plain-language summary and key terms
- High / medium / low flags with source quote, reason, and question to ask
- Server-side quote verification: flags are dropped unless the quote appears in extracted source text or the matching clause excerpt
- Grounded Q&A with existing clause citations and a “This document does not say” fallback
- English, Tamil, and Hindi output selection
- Session-only processing (no contract database)
- Checklist export as `.txt` (PDF export is a stretch feature in the brief)

## Requirements
- Node.js 20 or later recommended
- A Gemini API key

## Run locally
1. Extract this ZIP.
2. Open the folder in VS Code.
3. In the terminal, run:
   ```bash
   npm install
   ```
4. Create `.env.local` in the project root and add your server-side Gemini credentials:
   ```env
   GEMINI_API_KEY=your_server_side_key
   GEMINI_MODEL=your_currently_supported_model_id
   # Optional: use a dedicated random secret to sign short-lived Q&A sessions.
   SESSION_TOKEN_SECRET=your_private_session_signing_secret
   ```
   Use a model ID currently available to your Google AI API account. Do not use a `NEXT_PUBLIC_` variable for secrets, and never commit `.env.local`.
6. Run:
   ```bash
   npm run dev
   ```
7. Open `http://localhost:3000`.

If your Gemini account does not support the model in `.env.local`, set `GEMINI_MODEL` to a model available in your AI Studio account.

## Deploy to Vercel
1. Push the project to a private or public GitHub repository. Never commit `.env.local`.
2. Import the repository in Vercel.
3. Set the Vercel Node.js version to 20.x or newer (PDF.js 4 requires Node.js 20+).
4. Add `GEMINI_API_KEY` and `GEMINI_MODEL` in Vercel Project Settings → Environment Variables. `SESSION_TOKEN_SECRET` is optional but recommended; if omitted, the Gemini key signs short-lived Q&A session tokens.
5. Deploy, then verify a selectable-text PDF at or below 4 MB, Q&A, and the function logs for safe PDF runtime diagnostics.

## Important MVP limitations
- Scanned/image-only PDFs and OCR are not implemented.
- Rental is the recommended first contract type; loan/job options are included as experimental paths and need test coverage.
- Clause boundaries are inferred from extracted PDF headings, numbered sections, and paragraphs; review them against the original document.
- Analysis is bounded to 4 MB, 150 pages, 60,000 extracted characters, and 100 clauses. Larger documents are rejected rather than silently truncated.
- Q&A uses a signed, expiring, in-memory browser session token; no contract database is used.
- The model/provider receives extracted contract text to produce analysis. Do not upload confidential contracts unless you are comfortable with the provider's applicable data handling.
- This is not legal advice. It does not decide whether a clause is legal or whether a user should sign.
- This starter is a hackathon prototype, not a production legal product. Add rate limiting, stronger file validation, abuse controls, and comprehensive evaluation before public launch.

## Test before demo
Run the deterministic evidence/session tests and production build with:
```bash
npm test
npm run build
```

Use 8–10 public/sample rental agreements. Hand-label risky clauses and record:
- Flag recall target: at least 80%
- Flag precision target: at least 70%
- Quote match rate: 100% after code verification
- Grounded Q&A target: at least 90%
- Time-to-result target: under 60 seconds

Report actual measurements, not targets, in the pitch.
