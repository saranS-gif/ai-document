import { createHmac, timingSafeEqual } from "node:crypto";
import { ClauseListSchema, type Clause } from "./contract-validation";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

type SessionPayload = {
  version: 1;
  expires_at: number;
  clauses: Clause[];
  source_text: string;
};

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createDocumentToken(
  clauses: Clause[],
  sourceText: string,
  secret: string,
  now = Date.now()
): string {
  const payload: SessionPayload = {
    version: 1,
    expires_at: now + SESSION_TTL_MS,
    clauses,
    source_text: sourceText
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function readDocumentToken(
  token: string,
  secret: string,
  now = Date.now()
): SessionPayload | null {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra || token.length > 300_000) return null;

  let provided: Buffer;
  try {
    provided = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = signature(encoded, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SessionPayload>;
    const clauses = ClauseListSchema.safeParse(parsed.clauses);
    if (
      parsed.version !== 1 ||
      typeof parsed.expires_at !== "number" ||
      parsed.expires_at <= now ||
      typeof parsed.source_text !== "string" ||
      parsed.source_text.length > 60_000 ||
      !clauses.success
    ) {
      return null;
    }
    return { version: 1, expires_at: parsed.expires_at, clauses: clauses.data, source_text: parsed.source_text };
  } catch {
    return null;
  }
}
