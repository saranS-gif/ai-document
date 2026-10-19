import { z } from "zod";

export const ClauseSchema = z.object({
  id: z.string().regex(/^C\d+$/),
  text: z.string().min(1)
});

export const ClauseListSchema = z.array(ClauseSchema).min(1).max(100);

export const KeyTermSchema = z.object({
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(500),
  clause_id: z.string().min(1),
  quote: z.string().min(1)
});

export const EvidenceItemSchema = z.object({
  text: z.string().min(1).max(1000),
  clause_id: z.string().min(1),
  quote: z.string().min(1)
});

export const ImportantDateSchema = z.object({
  date: z.string().min(1).max(200),
  event: z.string().min(1).max(500),
  clause_id: z.string().min(1),
  quote: z.string().min(1)
});

export const ModelFlagSchema = z.object({
  clause_id: z.string().min(1),
  category: z.string().min(1).max(120),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string().min(1).max(180),
  quote: z.string().min(1),
  reason: z.string().min(1).max(1500),
  potential_impact: z.string().min(1).max(1000),
  question_to_ask: z.string().min(1).max(1000)
});

export const ModelAnalysisSchema = z.object({
  contract_type: z.string().min(1).max(160),
  summary: z.string().min(1).max(3000),
  key_terms: z.array(KeyTermSchema).max(20),
  key_obligations: z.array(EvidenceItemSchema).max(30),
  important_dates: z.array(ImportantDateSchema).max(30),
  missing_or_unspecified_information: z.array(z.string().min(1).max(500)).max(30),
  flags: z.array(z.unknown()).max(100)
});

export type Clause = z.infer<typeof ClauseSchema>;
export type ModelFlag = z.infer<typeof ModelFlagSchema>;

export type VerifiedFlag = ModelFlag & { id: string };

export type FlagValidationSummary = {
  total: number;
  accepted: number;
  rejected: number;
  rejected_reasons: Array<{ reason: string; count: number }>;
};

export type CitationCandidate = { clause_id: string; quote: string };

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractClauses(extractedText: string): Clause[] {
  const lines = extractedText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim());

  const chunks: string[] = [];
  let current: string[] = [];
  const numberedClauseStart = /^(?:(?:section|article|clause)\s+)?\d+(?:\.\d+)*(?:[.)])\s+\S/i;
  const bulletStart = /^(?:[-*•▪]|\(\w+\))\s+\S/;

  const flush = () => {
    const text = current.join("\n").trim();
    if (text) chunks.push(text);
    current = [];
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    if (current.length > 0 && (numberedClauseStart.test(line) || bulletStart.test(line))) {
      flush();
    }
    current.push(line);
  }
  flush();

  return chunks.map((text, index) => ({ id: `C${index + 1}`, text }));
}

export function getDocumentTextError(
  text: string,
  maximumLength = 60_000,
  minimumLength = 80
): "insufficient_text" | "document_too_long" | null {
  if (text.trim().length < minimumLength) return "insufficient_text";
  if (text.length > maximumLength) return "document_too_long";
  return null;
}

export function verifyQuote(
  quote: string,
  clauseId: string,
  clauses: Clause[],
  sourceText: string,
  minimumLength = 12
): { valid: true; clause: Clause } | { valid: false; reason: string } {
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length < minimumLength) {
    return { valid: false, reason: "quote_too_short" };
  }

  const clause = clauses.find(candidate => candidate.id === clauseId);
  if (!clause) return { valid: false, reason: "unknown_clause_id" };

  const normalizedClause = normalizeForMatch(clause.text);
  const normalizedSource = normalizeForMatch(sourceText);
  if (
    !normalizedClause.includes(normalizedQuote) ||
    !normalizedSource.includes(normalizedQuote) ||
    !normalizedSource.includes(normalizedClause)
  ) {
    return { valid: false, reason: "quote_not_in_cited_source_clause" };
  }

  return { valid: true, clause };
}

export function validateEvidenceItems<T extends { clause_id: string; quote: string }>(
  items: T[],
  clauses: Clause[],
  sourceText: string
): T[] {
  return items.filter(item =>
    verifyQuote(item.quote, item.clause_id, clauses, sourceText).valid
  );
}

export function validateFlags(
  input: unknown,
  clauses: Clause[],
  sourceText: string
): { flags: VerifiedFlag[]; summary: FlagValidationSummary } {
  const candidates = Array.isArray(input) ? input : [];
  const rejectedReasons = new Map<string, number>();
  const flags: VerifiedFlag[] = [];
  const seen = new Set<string>();

  const reject = (reason: string) => {
    rejectedReasons.set(reason, (rejectedReasons.get(reason) ?? 0) + 1);
  };

  for (const candidate of candidates) {
    const parsed = ModelFlagSchema.safeParse(candidate);
    if (!parsed.success) {
      reject("malformed_flag");
      continue;
    }

    const flag = parsed.data;
    const verification = verifyQuote(flag.quote, flag.clause_id, clauses, sourceText);
    if (!verification.valid) {
      reject(verification.reason);
      continue;
    }

    const duplicateKey = [
      flag.clause_id,
      normalizeForMatch(flag.category).toLowerCase(),
      normalizeForMatch(flag.quote).toLowerCase()
    ].join("\u0000");
    if (seen.has(duplicateKey)) {
      reject("duplicate_flag");
      continue;
    }

    seen.add(duplicateKey);
    flags.push({ ...flag, id: `F${flags.length + 1}` });
  }

  const rejected = rejectedReasons.values().reduce((sum, count) => sum + count, 0);
  return {
    flags,
    summary: {
      total: candidates.length,
      accepted: flags.length,
      rejected,
      rejected_reasons: [...rejectedReasons].map(([reason, count]) => ({ reason, count }))
    }
  };
}

export function validateCitations(
  input: unknown,
  clauses: Clause[],
  sourceText: string
): { valid: true; citations: CitationCandidate[] } | { valid: false; reason: string } {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) {
    return { valid: false, reason: "missing_or_invalid_citations" };
  }

  const citations: CitationCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of input) {
    const parsed = z.object({
      clause_id: z.string().min(1),
      quote: z.string().min(1)
    }).safeParse(candidate);
    if (!parsed.success) return { valid: false, reason: "malformed_citation" };

    const verification = verifyQuote(parsed.data.quote, parsed.data.clause_id, clauses, sourceText);
    if (!verification.valid) return { valid: false, reason: verification.reason };

    const key = `${parsed.data.clause_id}\u0000${normalizeForMatch(parsed.data.quote)}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push(parsed.data);
    }
  }

  return citations.length
    ? { valid: true, citations }
    : { valid: false, reason: "missing_or_invalid_citations" };
}

export function resolveGroundedAnswer(
  modelSupported: boolean,
  notStated: boolean,
  inputCitations: unknown,
  clauses: Clause[],
  sourceText: string
): { supported: true; citations: CitationCandidate[] } | { supported: false; citations: [] } {
  if (!modelSupported || notStated) return { supported: false, citations: [] };
  const verified = validateCitations(inputCitations, clauses, sourceText);
  return verified.valid
    ? { supported: true, citations: verified.citations }
    : { supported: false, citations: [] };
}
