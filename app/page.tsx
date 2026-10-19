"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  FileText,
  Languages,
  LoaderCircle,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  X
} from "lucide-react";

type Severity = "high" | "medium" | "low";
type Flag = {
  id: string;
  clause_id: string;
  category: string;
  severity: Severity;
  title: string;
  quote: string;
  reason: string;
  potential_impact: string;
  question_to_ask: string;
};
type Clause = { id: string; text: string };
type EvidenceItem = { text: string; clause_id: string; quote: string };
type ImportantDate = { date: string; event: string; clause_id: string; quote: string };
type Analysis = {
  contract_type: string;
  document_summary: string;
  summary: string;
  key_terms: { label: string; value: string; clause_id: string; quote: string }[];
  key_obligations: EvidenceItem[];
  important_dates: ImportantDate[];
  missing_or_unspecified_information: string[];
  clauses: Clause[];
  flags: Flag[];
  validation_summary: { total: number; accepted: number; rejected: number };
  coverage: { complete: boolean; analyzed_pages: number; total_pages: number; analyzed_clauses: number; total_clauses: number };
  limitations: string[];
  document_token: string;
};
type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  citations?: string[];
  evidence?: { clause_id: string; quote: string }[];
  supported?: boolean;
};

const severityLabel: Record<Severity, string> = {
  high: "High priority",
  medium: "Worth reviewing",
  low: "For awareness"
};

const suggestedQuestions = [
  "What are my main obligations?",
  "Which terms should I clarify?",
  "What information does this document not specify?"
];

function formatFileSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [contractType, setContractType] = useState("auto");
  const [language, setLanguage] = useState("English");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selectedClauseId, setSelectedClauseId] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);

  const selectedClause = analysis?.clauses.find(clause => clause.id === selectedClauseId);
  const flagCounts = useMemo(() => ({
    high: analysis?.flags.filter(flag => flag.severity === "high").length ?? 0,
    medium: analysis?.flags.filter(flag => flag.severity === "medium").length ?? 0,
    low: analysis?.flags.filter(flag => flag.severity === "low").length ?? 0
  }), [analysis]);
  const visibleFlags = useMemo(
    () => analysis?.flags.filter(flag => severityFilter === "all" || flag.severity === severityFilter) ?? [],
    [analysis, severityFilter]
  );

  function chooseFile(candidate: File | null) {
    setError("");
    if (!candidate) return;
    const looksLikePdf = candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("That file doesn’t look like a PDF. Choose a .pdf document to continue.");
      return;
    }
    if (candidate.size === 0) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("This file is empty. Choose a readable PDF.");
      return;
    }
    if (candidate.size > 8 * 1024 * 1024) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("This PDF is larger than the 8 MB limit. Choose a smaller file.");
      return;
    }
    setFile(candidate);
    setAnalysis(null);
    setMessages([]);
  }

  async function analyze() {
    if (!file || loading) return;
    setLoading(true);
    setError("");
    setAnalysis(null);
    setMessages([]);
    setSelectedClauseId("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("contractType", contractType);
      form.append("language", language);
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : "Analysis could not be completed. Please try again.";
        throw new Error(message);
      }
      setAnalysis(data as Analysis);
      const firstClause = (data as Analysis).clauses?.[0]?.id ?? "";
      setSelectedClauseId(firstClause);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis could not be completed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!analysis || !question.trim() || asking) return;
    const currentQuestion = question.trim();
    setQuestion("");
    setMessages(previous => [...previous, { role: "user", text: currentQuestion }]);
    setAsking(true);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion,
          document_token: analysis.document_token,
          language
        })
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : "Could not answer that question. Please try again.";
        throw new Error(message);
      }
      const answer = data as {
        answer: string;
        citations?: string[];
        citation_evidence?: { clause_id: string; quote: string }[];
        supported?: boolean;
      };
      setMessages(previous => [...previous, {
        role: "assistant",
        text: answer.answer,
        citations: answer.citations ?? [],
        evidence: answer.citation_evidence ?? [],
        supported: answer.supported === true
      }]);
      window.setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
    } catch (caught) {
      setMessages(previous => [...previous, {
        role: "assistant",
        text: caught instanceof Error ? caught.message : "Could not answer that question. Please try again."
      }]);
    } finally {
      setAsking(false);
    }
  }

  function downloadChecklist() {
    if (!analysis) return;
    const content = [
      "CLAUSECLEAR — CONTRACT REVIEW NOTES",
      `Contract type: ${analysis.contract_type}`,
      "",
      "PLAIN-LANGUAGE SUMMARY",
      analysis.summary,
      "",
      "KEY TERMS",
      ...analysis.key_terms.map(term => `• ${term.label}: ${term.value}\n  Source: Clause ${term.clause_id} — ${term.quote}`),
      "",
      "POTENTIAL CONCERNS TO REVIEW",
      ...analysis.flags.map((flag, index) => `${index + 1}. [${severityLabel[flag.severity]}] ${flag.title}\n   ${flag.reason}\n   Source: Clause ${flag.clause_id} — ${flag.quote}\n   Question: ${flag.question_to_ask}`),
      "",
      "KEY OBLIGATIONS",
      ...analysis.key_obligations.map(item => `• ${item.text}\n  Source: Clause ${item.clause_id} — ${item.quote}`),
      "",
      "This document explains contract wording; it is not legal advice."
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "clauseclear-review-notes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function startNewReview() {
    setAnalysis(null);
    setFile(null);
    setMessages([]);
    setQuestion("");
    setError("");
    setSelectedClauseId("");
    setSeverityFilter("all");
    if (inputRef.current) inputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateToClause(clauseId: string) {
    setSelectedClauseId(clauseId);
    window.setTimeout(() => {
      document.getElementById("clause-explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ClauseClear home">
          <span className="brand-mark"><ShieldCheck size={19} strokeWidth={2.1} /></span>
          <span className="brand-name">Clause<span>Clear</span></span>
        </a>
        <nav className="top-navigation" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <span className="privacy-indicator"><span aria-hidden="true" /> Session-only review</span>
        </nav>
      </header>

      <section className="intro" id="top">
        <div className="eyebrow"><Sparkles size={13} /> CONTRACT CLARITY, GROUNDED IN THE TEXT</div>
        <div className="intro-row">
          <div>
            <h1>Know what to question<br /><span>before you sign.</span></h1>
            <p className="intro-copy">Understand the words on the page. Explore potential concerns with source references you can check for yourself.</p>
          </div>
          <div className="intro-note">
            <span className="note-mark"><FileCheck2 size={18} /></span>
            <p><strong>Evidence first.</strong><br />Quotes are checked against the text extracted from your PDF.</p>
          </div>
        </div>
      </section>

      <div className={`workspace ${analysis ? "has-analysis" : ""}`}>
        <aside className="upload-column" aria-label="Contract upload">
          <section className="upload-panel">
            <div className="section-heading">
              <span className="step-index">01</span>
              <div><span className="overline">GET STARTED</span><h2>Review a contract</h2></div>
            </div>
            <p className="supporting-copy">Add a text-based PDF. We’ll organize its clauses and explain what may be worth clarifying.</p>

            {!file ? (
              <div
                className={`upload-dropzone ${dragging ? "is-dragging" : ""}`}
                onDragOver={event => { event.preventDefault(); setDragging(true); }}
                onDragLeave={event => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
                }}
                onDrop={event => {
                  event.preventDefault();
                  setDragging(false);
                  chooseFile(event.dataTransfer.files[0] ?? null);
                }}
              >
                <input
                  ref={inputRef}
                  className="visually-hidden"
                  id="contract-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={event => chooseFile(event.target.files?.[0] ?? null)}
                  aria-describedby="upload-hint"
                />
                <span className="upload-symbol"><Upload size={19} /></span>
                <strong>Drop your PDF here</strong>
                <span id="upload-hint">or choose a file from your device</span>
                <label className="button-secondary file-picker" htmlFor="contract-file">Choose PDF</label>
                <small>PDF only <span aria-hidden="true">·</span> Up to 8 MB <span aria-hidden="true">·</span> Selectable text required</small>
              </div>
            ) : (
              <div className="file-preview">
                <span className="file-icon"><FileText size={19} /></span>
                <div className="file-information">
                  <strong title={file.name}>{file.name}</strong>
                  <span>{formatFileSize(file.size)} <span aria-hidden="true">·</span> PDF</span>
                </div>
                <button
                  className="icon-button remove-file"
                  type="button"
                  onClick={() => { setFile(null); setAnalysis(null); setMessages([]); if (inputRef.current) inputRef.current.value = ""; }}
                  aria-label={`Remove ${file.name}`}
                ><X size={16} /></button>
              </div>
            )}

            <div className="settings-grid">
              <label className="form-field" htmlFor="contract-type">
                <span>Contract type</span>
                <span className="select-wrap"><select id="contract-type" value={contractType} onChange={event => setContractType(event.target.value)}>
                  <option value="auto">Auto-detect</option>
                  <option value="rental">Rental agreement</option>
                  <option value="loan">Loan agreement</option>
                  <option value="job">Job / offer letter</option>
                </select><ChevronDown size={14} aria-hidden="true" /></span>
              </label>
              <label className="form-field" htmlFor="output-language">
                <span><Languages size={13} /> Output language</span>
                <span className="select-wrap"><select id="output-language" value={language} onChange={event => setLanguage(event.target.value)}>
                  <option>English</option><option>Tamil</option><option>Hindi</option>
                </select><ChevronDown size={14} aria-hidden="true" /></span>
              </label>
            </div>

            <button className="button-primary analyze-button" onClick={analyze} disabled={!file || loading}>
              {loading ? <><LoaderCircle size={16} className="spin" /> Reviewing document…</> : <>Analyze contract <ArrowRight size={16} /></>}
            </button>

            {loading && <div className="loading-status" role="status" aria-live="polite">
              <span className="loading-track"><span /></span>
              <span>Reading the PDF and checking source references. Larger documents may take a little longer.</span>
            </div>}
            {error && <div className="error-message" role="alert"><AlertCircle size={16} /><div><strong>We couldn’t complete the review</strong><p>{error}</p></div></div>}

            <div className="privacy-note"><ShieldCheck size={15} /><p>Documents are processed for this request, not saved in an app database. Extracted text is sent to the AI provider for analysis.</p></div>
          </section>

          <aside className="trust-note"><CircleHelp size={15} /><p>ClauseClear helps explain wording. It does not decide whether an agreement is fair or replace qualified legal advice.</p></aside>
        </aside>

        <section className="results-column" aria-label={analysis ? "Contract analysis" : "Analysis preview"}>
          {!analysis && !loading && (
            <section className="welcome-panel">
              <div className="welcome-topline"><span className="overline">YOUR REVIEW WORKSPACE</span><span className="quiet-status"><span /> Ready when you are</span></div>
              <div className="welcome-content">
                <div className="document-illustration" aria-hidden="true">
                  <div className="document-sheet"><span className="sheet-label">AGREEMENT</span><i /><i /><i /><i /><b /></div>
                  <span className="document-check"><Check size={16} /></span>
                </div>
                <div className="welcome-copy">
                  <h2>A clearer view of what’s in your contract.</h2>
                  <p>Your report will bring together the plain-language summary, terms to notice, and verified source wording.</p>
                </div>
              </div>
              <div className="welcome-steps">
                <div><span>01</span><p><strong>Upload</strong><small>Choose a selectable-text PDF</small></p></div>
                <div><span>02</span><p><strong>Understand</strong><small>Review terms and potential concerns</small></p></div>
                <div><span>03</span><p><strong>Clarify</strong><small>Ask questions with source citations</small></p></div>
              </div>
              <p className="welcome-footnote">No OCR for scanned documents. No legal conclusions. Just a starting point for your own review.</p>
            </section>
          )}

          {loading && <section className="processing-panel" role="status" aria-live="polite">
            <span className="processing-icon"><LoaderCircle size={22} className="spin" /></span>
            <span className="overline">WORKING ON YOUR REVIEW</span>
            <h2>Reading the document carefully.</h2>
            <p>Organizing the extracted text and verifying source quotations. We’ll show results when the review is ready.</p>
          </section>}

          {analysis && (
            <>
              <section className="report-toolbar">
                <div><span className="overline">CONTRACT REVIEW</span><h2>Your clarity report</h2>{file && <p className="report-filename"><FileText size={12} /> {file.name}</p>}</div>
                <div className="toolbar-actions">
                  <button className="button-secondary export-button" onClick={downloadChecklist}><ArrowDownToLine size={15} /> Export notes</button>
                  <button className="button-quiet" onClick={startNewReview}><Plus size={15} /> New review</button>
                </div>
              </section>

              <section className="overview-section">
                <div className="overview-meta">
                  <span className="type-label">{analysis.contract_type}</span>
                  <span className={`completion-label ${analysis.coverage.complete ? "" : "partial"}`}>
                    {analysis.coverage.complete ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {analysis.coverage.complete ? "Text coverage complete" : "Partial text coverage"}
                  </span>
                </div>
                <h3>In plain language</h3>
                <p className="overview-summary">{analysis.document_summary || analysis.summary}</p>
                <div className="coverage-line">
                  <span>{analysis.coverage.analyzed_pages} of {analysis.coverage.total_pages} pages processed</span>
                  <span aria-hidden="true">·</span>
                  <span>{analysis.clauses.length} extracted sections</span>
                </div>
              </section>

              <section className="key-points-section">
                <div className="section-title-row"><div><span className="overline">THE EXPLICIT TERMS</span><h3>Key terms & obligations</h3></div></div>
                {analysis.key_terms.length === 0 && analysis.key_obligations.length === 0 && analysis.important_dates.length === 0 ? (
                  <div className="quiet-empty"><CircleHelp size={16} /><p>No key terms, obligations, or dates with verifiable quotes were returned for this document.</p></div>
                ) : (
                  <div className="key-points">
                    {analysis.key_terms.map((term, index) => (
                      <article className="key-point" key={`term-${index}`}>
                        <span className="point-label">{term.label}</span><strong>{term.value}</strong>
                        <button className="text-source" onClick={() => navigateToClause(term.clause_id)}>Clause {term.clause_id} <ArrowRight size={12} /></button>
                      </article>
                    ))}
                    {analysis.key_obligations.map((item, index) => (
                      <article className="key-point obligation-point" key={`obligation-${index}`}>
                        <span className="point-label">Obligation</span><strong>{item.text}</strong>
                        <button className="text-source" onClick={() => navigateToClause(item.clause_id)}>Clause {item.clause_id} <ArrowRight size={12} /></button>
                      </article>
                    ))}
                    {analysis.important_dates.map((item, index) => (
                      <article className="key-point" key={`date-${index}`}>
                        <span className="point-label">Important date</span><strong>{item.date} — {item.event}</strong>
                        <button className="text-source" onClick={() => navigateToClause(item.clause_id)}>Clause {item.clause_id} <ArrowRight size={12} /></button>
                      </article>
                    ))}
                  </div>
                )}
                {analysis.missing_or_unspecified_information.length > 0 && (
                  <details className="missing-information">
                    <summary><CircleHelp size={15} /> Information not found in the extracted text <span>{analysis.missing_or_unspecified_information.length}</span></summary>
                    <p>This does not confirm that a term is absent from the full contract. Review the original document to check.</p>
                    <ul>{analysis.missing_or_unspecified_information.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  </details>
                )}
              </section>

              <section className="risk-section">
                <div className="section-title-row risk-title-row">
                  <div><span className="overline">POTENTIAL CONCERNS</span><h3>Worth a closer look</h3></div>
                  <span className="flag-count">{analysis.flags.length} verified {analysis.flags.length === 1 ? "flag" : "flags"}</span>
                </div>
                <p className="section-explainer">A review priority—not a legal risk score or a conclusion about enforceability.</p>
                <div className="severity-overview" aria-label="Verified flag counts by review priority">
                  {(["high", "medium", "low"] as const).map(severity => (
                    <button key={severity} className={`severity-count ${severity} ${severityFilter === severity ? "is-active" : ""}`} onClick={() => setSeverityFilter(severityFilter === severity ? "all" : severity)} aria-pressed={severityFilter === severity}>
                      <span className="severity-marker">{severity === "high" ? "!" : severity === "medium" ? "•" : "i"}</span><strong>{flagCounts[severity]}</strong><span>{severityLabel[severity]}</span>
                    </button>
                  ))}
                </div>
                {analysis.validation_summary.rejected > 0 && (
                  <p className="verification-note"><ShieldCheck size={14} /> {analysis.validation_summary.rejected} generated {analysis.validation_summary.rejected === 1 ? "flag was" : "flags were"} omitted because the source quote or clause reference could not be verified.</p>
                )}
                {analysis.flags.length === 0 ? (
                  <div className="no-risks"><CheckCircle2 size={19} /><div><strong>No potential concerns were identified in the verified flags.</strong><p>This is not a guarantee that the contract has no risks. Check the extracted clauses and original document.</p></div></div>
                ) : visibleFlags.length === 0 ? (
                  <div className="quiet-empty"><p>No flags at this priority. Select another priority or clear the filter.</p><button className="text-source" onClick={() => setSeverityFilter("all")}>Show all flags</button></div>
                ) : (
                  <div className="risk-list">
                    {visibleFlags.map(flag => (
                      <article className={`risk-card ${flag.severity}`} id={`risk-${flag.id}`} key={flag.id}>
                        <div className="risk-card-heading">
                          <span className={`severity-badge ${flag.severity}`}><span aria-hidden="true">{flag.severity === "high" ? "!" : flag.severity === "medium" ? "•" : "i"}</span>{severityLabel[flag.severity]}</span>
                          <span className="risk-category">{flag.category.replaceAll("_", " ")}</span>
                          <button className="text-source risk-source" onClick={() => navigateToClause(flag.clause_id)}>Clause {flag.clause_id} <ArrowRight size={12} /></button>
                        </div>
                        <h4>{flag.title}</h4>
                        <p className="risk-reason">{flag.reason}</p>
                        <p className="risk-impact"><strong>Why it may matter</strong>{flag.potential_impact}</p>
                        <blockquote className="evidence-quote"><span><ShieldCheck size={13} /> VERIFIED SOURCE · CLAUSE {flag.clause_id}</span><p>“{flag.quote}”</p></blockquote>
                        <div className="clarify-question"><span>Worth asking</span><p>{flag.question_to_ask}</p></div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="explorer-section" id="clause-explorer">
                <div className="section-title-row"><div><span className="overline">SOURCE DOCUMENT</span><h3>Explore the clauses</h3></div><span className="clause-count">{analysis.clauses.length} sections</span></div>
                <p className="section-explainer">Read the wording extracted from the PDF. Clause IDs are assigned to the extracted sections, not original legal numbering.</p>
                <div className="clause-explorer">
                  <div className="clause-navigation" aria-label="Extracted clauses">
                    {analysis.clauses.map(clause => {
                      const linkedFlags = analysis.flags.filter(flag => flag.clause_id === clause.id).length;
                      return <button key={clause.id} className={`clause-nav-item ${selectedClauseId === clause.id ? "selected" : ""}`} onClick={() => setSelectedClauseId(clause.id)} aria-current={selectedClauseId === clause.id ? "true" : undefined}>
                        <span><strong>Clause {clause.id}</strong>{linkedFlags > 0 && <small>{linkedFlags} verified {linkedFlags === 1 ? "flag" : "flags"}</small>}</span><ArrowRight size={14} />
                      </button>;
                    })}
                  </div>
                  <article className="clause-reading" aria-live="polite">
                    {selectedClause ? (
                      <>
                        <span className="overline">EXTRACTED WORDING</span><h4>Clause {selectedClause.id}</h4><p>{selectedClause.text}</p>
                        {analysis.flags.filter(flag => flag.clause_id === selectedClause.id).map(flag => (
                          <div className="linked-risk" key={flag.id}><span className={`severity-badge ${flag.severity}`}>{severityLabel[flag.severity]}</span><strong>{flag.title}</strong><button className="text-source" onClick={() => document.getElementById(`risk-${flag.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>View concern <ArrowRight size={12} /></button></div>
                        ))}
                      </>
                    ) : <div className="quiet-empty"><p>Select a clause to read its extracted wording.</p></div>}
                  </article>
                </div>
              </section>

              <section className="chat-section" aria-labelledby="chat-title">
                <div className="chat-intro">
                  <span className="chat-icon"><MessageCircle size={17} /></span>
                  <div><span className="overline">ASK A FOLLOW-UP</span><h3 id="chat-title">Ask about this contract</h3><p>Answers rely on this document. Quotes and clause references are checked before they’re shown.</p></div>
                </div>
                <div className="suggested-questions" aria-label="Suggested questions">
                  {suggestedQuestions.map(suggestion => <button key={suggestion} onClick={() => setQuestion(suggestion)} disabled={asking}>{suggestion}<ArrowRight size={13} /></button>)}
                </div>
                <div className="conversation" aria-live="polite" aria-relevant="additions text">
                  {messages.length === 0 && <p className="conversation-empty">Ask a question to begin. If the document doesn’t support an answer, ClauseClear will say so.</p>}
                  {messages.map((message, index) => (
                    <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                      <span className="message-label">{message.role === "assistant" ? "CLAUSECLEAR" : "YOU"}</span>
                      <div className="message-body"><p>{message.text}</p>
                        {message.citations && message.citations.length > 0 && <div className="citation-list" aria-label="Verified clause references">{message.citations.map((citation, citationIndex) => {
                          const clauseId = citation.replace(/^Clause\s+/i, "");
                          return <button className="citation-link" key={`${citation}-${citationIndex}`} onClick={() => navigateToClause(clauseId)}>{citation}<ArrowRight size={11} /></button>;
                        })}</div>}
                        {message.evidence?.map((evidence, evidenceIndex) => <blockquote className="chat-quote" key={`${evidence.clause_id}-${evidenceIndex}`}><span>VERIFIED QUOTE · CLAUSE {evidence.clause_id}</span><p>“{evidence.quote}”</p></blockquote>)}
                        {message.role === "assistant" && message.supported && <small className="interpretation-note">Quote matching confirms the source text, not the legal interpretation.</small>}
                      </div>
                    </article>
                  ))}
                  {asking && <div className="answer-loading" role="status"><LoaderCircle size={15} className="spin" /> Checking the source clauses…</div>}
                  <div ref={chatEndRef} />
                </div>
                <form className="question-form" onSubmit={askQuestion}>
                  <label className="visually-hidden" htmlFor="contract-question">Ask a question about this contract</label>
                  <input id="contract-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about a term, date, or obligation…" maxLength={1000} disabled={asking} />
                  <button className="button-primary send-button" type="submit" disabled={asking || !question.trim()} aria-label="Send question">{asking ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={17} />}</button>
                </form>
                <p className="chat-disclaimer">Answers are explanations of the text, not legal advice. Review the original clause before relying on an interpretation.</p>
              </section>

              {analysis.limitations.length > 0 && (
                <details className="limitations-panel"><summary>About this review</summary><ul>{analysis.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>
              )}
            </>
          )}
        </section>
      </div>

      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <span className="overline">A CLEARER WAY TO REVIEW</span>
        <h2 id="how-title">From contract text to better questions.</h2>
        <div className="how-steps">
          <article><span>01</span><div><h3>Read the source</h3><p>Selectable PDF text is extracted and organized into sections. Scanned pages aren’t processed with OCR.</p></div></article>
          <article><span>02</span><div><h3>Check the evidence</h3><p>Potential concerns are shown with quotes checked against their cited source clause.</p></div></article>
          <article><span>03</span><div><h3>Ask and clarify</h3><p>Ask about the document and follow verified references back to the extracted wording.</p></div></article>
        </div>
      </section>

      <footer className="site-footer">
        <a className="footer-brand" href="#top"><ShieldCheck size={16} /> ClauseClear</a>
        <p>Clear explanations of contract wording—not a substitute for advice from a qualified legal professional.</p>
        <span>Documents are processed for this request and are not stored in an app database.</span>
      </footer>
    </main>
  );
}
