import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type PdfLoadFailure = {
  kind: "password" | "invalid_pdf" | "runtime";
  status: number;
  message: string;
};

export function classifyPdfLoadFailure(error: unknown): PdfLoadFailure {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "";

  if (name === "PasswordException") {
    return {
      kind: "password",
      status: 422,
      message: "This PDF is password-protected. Remove the password and upload it again."
    };
  }

  if (["InvalidPDFException", "MissingPDFException", "FormatError"].includes(name)) {
    return {
      kind: "invalid_pdf",
      status: 422,
      message: "This PDF could not be read. Re-save or export it again, then retry."
    };
  }

  if (/worker|pdf\.worker|Promise\.withResolvers|ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)/i.test(message)) {
    return {
      kind: "runtime",
      status: 500,
      message: "PDF processing is unavailable in this server environment. Please try again later."
    };
  }

  return {
    kind: "runtime",
    status: 500,
    message: "A server error prevented PDF processing. Please try again later."
  };
}

export async function openPdfDocument(data: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  return pdfjs.getDocument({ data, useSystemFonts: true }).promise;
}
