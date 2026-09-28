"use client";

import { useEffect, useMemo, useState } from "react";

export type RubricCoverageSignal = {
  seen: boolean;
  score: number;
  criteria: number;
  uncovered: number;
  unsupportedClaims: number;
  highPriorityGaps: number;
};

type Criterion = { id: string; label: string; weight: number };
type Row = {
  criterion: Criterion;
  coverage: number;
  passage: string;
  passageIndex: number | null;
  keywordMatch: number;
  claims: number;
  supportedClaims: number;
  citation: boolean;
  sourceSupport: boolean;
  status: "covered" | "review" | "gap";
};

type Props = { open: boolean; onClose: () => void };

const STOP = new Set(["the","a","an","and","or","of","to","in","on","for","with","by","from","is","are","be","as","at","that","this","these","those","your","you","students","student","assignment","report","essay","demonstrate","show","use","using"]);
const CITATION_RE = /\([^)]+,\s*(?:19|20)\d{2}[a-z]?[^)]*\)|\[(?:\d+)(?:\s*,\s*\d+)*\]|\b(?:19|20)\d{2}\b/i;
const CLAIM_RE = /\b(?:shows?|suggests?|indicates?|demonstrates?|reveals?|causes?|results?\s+in|leads?\s+to|is|are|was|were|has|have|can|may|will|increases?|decreases?|improves?|reduces?|affects?)\b/i;

function compact(value: string) { return value.replace(/\s+/g, " ").trim(); }
function words(value: string) { return compact(value).match(/[A-Za-z][A-Za-z'-]{2,}/g)?.map((item) => item.toLowerCase()) ?? []; }
function tokens(value: string) { return [...new Set(words(value).filter((item) => !STOP.has(item)))]; }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

function parseCriteria(text: string): Criterion[] {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.replace(/^[\s•*\-\d.)]+/, "").trim()).filter(Boolean);
  const rows: Criterion[] = [];
  lines.forEach((line, index) => {
    const matched = line.match(/^(.*?)(?:\s*[:\-–]\s*|\s+)(\d{1,3})\s*(%|marks?|points?)\s*$/i);
    const label = compact((matched?.[1] ?? line).replace(/\s+/g, " ")).slice(0, 140);
    const weight = matched ? Number(matched[2]) : 0;
    if (label.length < 3) return;
    if (rows.some((item) => item.label.toLowerCase() === label.toLowerCase())) return;
    rows.push({ id: `criterion-${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36)}`, label, weight: weight > 0 && weight <= 100 ? weight : 0 });
  });
  return rows.slice(0, 14);
}

function paragraphs(text: string) {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map(compact).filter((item) => item.length >= 24);
  if (blocks.length > 1) return blocks;
  return text.replace(/\r/g, "").split(/\n+/).map(compact).filter((item) => item.length >= 24);
}

function sentences(value: string) {
  return value.split(/(?<=[.!?])\s+/).map(compact).filter((item) => item.length >= 30);
}

function overlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const right = new Set(b);
  const matched = a.filter((item) => right.has(item)).length;
  return matched / Math.max(1, Math.min(a.length, 10));
}

function sourceOverlap(sentence: string, source: string) {
  if (!source.trim()) return 0;
  const target = tokens(sentence);
  let best = 0;
  for (const sourceSentence of sentences(source).slice(0, 80)) best = Math.max(best, overlap(target, tokens(sourceSentence)));
  return best;
}

function claimLike(sentence: string) {
  return words(sentence).length >= 8 && (CLAIM_RE.test(sentence) || /\b\d+(?:\.\d+)?%?\b/.test(sentence));
}

function analyze(criteria: Criterion[], draft: string, source: string): { rows: Row[]; signal: RubricCoverageSignal } {
  const blocks = paragraphs(draft);
  const rows: Row[] = criteria.map((criterion) => {
    const criterionTokens = tokens(criterion.label);
    let bestIndex = -1;
    let bestMatch = 0;
    blocks.forEach((block, index) => {
      const value = overlap(criterionTokens, tokens(block));
      if (value > bestMatch) { bestMatch = value; bestIndex = index; }
    });
    const passage = bestIndex >= 0 ? blocks[bestIndex] : "";
    const passageSentences = passage ? sentences(passage) : [];
    const claims = passageSentences.filter(claimLike);
    let supportedClaims = 0;
    let sourceSupport = false;
    claims.forEach((claim) => {
      const sourceScore = sourceOverlap(claim, source);
      if (sourceScore >= 0.28) sourceSupport = true;
      if (CITATION_RE.test(claim) || sourceScore >= 0.28) supportedClaims += 1;
    });
    const citation = CITATION_RE.test(passage);
    const matchScore = bestMatch * 100;
    const claimRatio = claims.length ? supportedClaims / claims.length : 0;
    const coverage = clamp(matchScore * 0.67 + claimRatio * 23 + (citation || sourceSupport ? 10 : 0));
    const status: Row["status"] = coverage >= 70 ? "covered" : coverage >= 40 ? "review" : "gap";
    return {
      criterion,
      coverage,
      passage: passage.slice(0, 420),
      passageIndex: bestIndex >= 0 ? bestIndex + 1 : null,
      keywordMatch: clamp(matchScore),
      claims: claims.length,
      supportedClaims,
      citation,
      sourceSupport,
      status,
    };
  });

  const weighted = rows.filter((row) => row.criterion.weight > 0);
  const totalWeight = weighted.reduce((sum, row) => sum + row.criterion.weight, 0);
  const score = rows.length
    ? clamp(totalWeight > 0
      ? weighted.reduce((sum, row) => sum + row.coverage * row.criterion.weight, 0) / totalWeight
      : rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length)
    : 0;
  const positiveWeights = rows.map((row) => row.criterion.weight).filter((value) => value > 0).sort((a, b) => a - b);
  const medianWeight = positiveWeights.length ? positiveWeights[Math.floor(positiveWeights.length / 2)] : 0;
  const unsupportedClaims = rows.reduce((sum, row) => sum + Math.max(0, row.claims - row.supportedClaims), 0);
  const uncovered = rows.filter((row) => row.status === "gap").length;
  const highPriorityGaps = rows.filter((row) => row.coverage < 55 && (row.criterion.weight === 0 || row.criterion.weight >= medianWeight)).length;
  return { rows, signal: { seen: rows.length > 0, score, criteria: rows.length, uncovered, unsupportedClaims, highPriorityGaps } };
}

function readStudioText() {
  const accepted = Array.from(document.querySelectorAll<HTMLElement>("section,article,div")).find((node) => /ACCEPTED DRAFT PREVIEW/i.test(node.textContent ?? ""));
  const acceptedText = accepted?.querySelector<HTMLElement>("p,pre,textarea")?.textContent?.trim();
  const draft = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]')?.value ?? "";
  const source = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="40000"]')?.value ?? "";
  return { draft: acceptedText && acceptedText.length > 40 ? acceptedText : draft, source };
}

export default function RubricClaimCoverageV33({ open, onClose }: Props) {
  const [rubric, setRubric] = useState("");
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const current = readStudioText();
    if (!draft.trim() && current.draft.trim()) setDraft(current.draft);
    if (!source.trim() && current.source.trim()) setSource(current.source);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, onClose, draft, source]);

  useEffect(() => {
    const onAssignment = (event: Event) => {
      const detail = (event as CustomEvent<{ rubric?: Array<{ label: string; weight: number }> }>).detail;
      if (!detail?.rubric?.length) return;
      const value = detail.rubric.map((item) => `${item.label} — ${item.weight}%`).join("\n");
      setRubric((current) => current.trim() ? current : value);
    };
    window.addEventListener("averis:assignment-analysis", onAssignment as EventListener);
    return () => window.removeEventListener("averis:assignment-analysis", onAssignment as EventListener);
  }, []);

  const criteria = useMemo(() => parseCriteria(rubric), [rubric]);
  const result = useMemo(() => analyze(criteria, draft, source), [criteria, draft, source]);

  function run() {
    const next = readStudioText();
    if (!draft.trim() && next.draft.trim()) setDraft(next.draft);
    if (!source.trim() && next.source.trim()) setSource(next.source);
    setHasRun(true);
    window.setTimeout(() => {
      const activeCriteria = parseCriteria(rubric);
      const active = analyze(activeCriteria, draft.trim() ? draft : next.draft, source.trim() ? source : next.source);
      window.dispatchEvent(new CustomEvent("averis:rubric-coverage", { detail: active.signal }));
    }, 0);
  }

  function loadStudio() {
    const current = readStudioText();
    setDraft(current.draft);
    setSource(current.source);
    setHasRun(false);
  }

  const report = useMemo(() => {
    if (!hasRun) return "";
    const lines = result.rows.map((row) => [
      `${row.status === "covered" ? "[COVERED]" : row.status === "review" ? "[REVIEW]" : "[GAP]"} ${row.criterion.label}${row.criterion.weight ? ` (${row.criterion.weight})` : ""}`,
      `Coverage: ${row.coverage}/100 · keyword match ${row.keywordMatch}% · claims ${row.supportedClaims}/${row.claims} supported · citation ${row.citation ? "yes" : "no"} · source support ${row.sourceSupport ? "yes" : "no"}`,
      row.passage ? `Best draft passage: ${row.passage}` : "Best draft passage: none found",
    ].join("\n")).join("\n\n");
    return `Averis Rubric & Claim Coverage Matrix v33\nCoverage signal: ${result.signal.score}/100\nCriteria: ${result.signal.criteria} · uncovered: ${result.signal.uncovered} · unsupported claims: ${result.signal.unsupportedClaims} · high-priority gaps: ${result.signal.highPriorityGaps}\n\n${lines}\n\nBoundary: This is a deterministic coverage signal, not a grade prediction. Verify every rubric criterion, claim, citation and source against the assignment brief and original sources.`;
  }, [hasRun, result]);

  async function copyReport() {
    if (!report) return;
    try { await navigator.clipboard.writeText(report); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
  }

  if (!open) return null;
  const state = result.signal.score >= 80 && result.signal.uncovered === 0 ? "strong" : result.signal.score >= 55 ? "review" : "attention";

  return (
    <div className="rubricV33Backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="rubricV33Drawer" role="dialog" aria-modal="true" aria-labelledby="rubric-v33-title">
        <header className="rubricV33Header">
          <div><span>AVERIS · RUBRIC & CLAIM COVERAGE V33</span><h2 id="rubric-v33-title">See where marks, claims and evidence are under-covered.</h2><p>Local deterministic mapping only. No AI quota, backend write, grade prediction, or invented evidence.</p></div>
          <button type="button" className="rubricV33Close" onClick={onClose} aria-label="Close Rubric and Claim Coverage Matrix">×</button>
        </header>
        <div className="rubricV33Body">
          <section className="rubricV33Setup">
            <div className="rubricV33SectionHead"><div><span>01 · RUBRIC</span><strong>Paste marking criteria or rubric rows</strong></div><small>{criteria.length} criteria detected</small></div>
            <textarea value={rubric} onChange={(event) => { setRubric(event.target.value); setHasRun(false); }} maxLength={9000} aria-label="Rubric criteria" placeholder={'Critical analysis — 30%\nEvidence and sources — 25%\nStructure and coherence — 20%\nRecommendations — 15%\nReferencing — 10%'} />
            <div className="rubricV33Actions"><button type="button" className="rubricV33Primary" onClick={run} disabled={criteria.length === 0 || draft.trim().length < 40}>Build coverage matrix</button><button type="button" onClick={loadStudio}>Reload Studio draft</button><span>{draft ? `${words(draft).length.toLocaleString()} draft words` : "No Studio draft loaded"} · {source.trim() ? "source context connected" : "no source context"}</span></div>
          </section>

          {hasRun ? <>
            <section className="rubricV33Hero" data-state={state}>
              <div><span>COVERAGE SIGNAL</span><strong>{result.signal.score}<small>/100</small></strong><p>{state === "strong" ? "Strong coverage map" : state === "review" ? "Focused review needed" : "Important gaps remain"}</p></div>
              <div className="rubricV33Metrics"><article><span>CRITERIA</span><strong>{result.signal.criteria}</strong><small>mapped</small></article><article><span>UNCOVERED</span><strong>{result.signal.uncovered}</strong><small>low-match criteria</small></article><article><span>UNSUPPORTED CLAIMS</span><strong>{result.signal.unsupportedClaims}</strong><small>in matched passages</small></article><article><span>PRIORITY GAPS</span><strong>{result.signal.highPriorityGaps}</strong><small>higher-weight / weak</small></article></div>
            </section>

            <section className="rubricV33Matrix">
              <div className="rubricV33SectionHead"><div><span>02 · COVERAGE MATRIX</span><strong>Criterion → passage → claim support</strong></div><button type="button" onClick={copyReport}>{copied ? "Report copied" : "Copy coverage report"}</button></div>
              <div className="rubricV33Rows">
                {result.rows.map((row, index) => <article key={row.criterion.id} data-state={row.status}>
                  <div className="rubricV33RowHead"><span>{String(index + 1).padStart(2,"0")}</span><strong>{row.criterion.label}</strong>{row.criterion.weight > 0 && <b>{row.criterion.weight}</b>}<em>{row.coverage}/100</em></div>
                  <div className="rubricV33Track" role="progressbar" aria-label={`${row.criterion.label} coverage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.coverage}><i style={{ width: `${row.coverage}%` }} /></div>
                  <div className="rubricV33RowStats"><span>Keyword match <b>{row.keywordMatch}%</b></span><span>Claims supported <b>{row.supportedClaims}/{row.claims}</b></span><span>Citation <b>{row.citation ? "Yes" : "No"}</b></span><span>Source match <b>{row.sourceSupport ? "Yes" : "No"}</b></span></div>
                  <p>{row.passage ? <><b>Best passage {row.passageIndex ? `#${row.passageIndex}` : ""}:</b> {row.passage}</> : "No meaningful draft passage matched this criterion."}</p>
                </article>)}
              </div>
            </section>

            <p className="rubricV33Boundary">Coverage is based on transparent text matching and support signals. A high score does not guarantee marks or rubric satisfaction. Read the lecturer's rubric and verify each claim/source yourself.</p>
          </> : <section className="rubricV33Empty"><span>READY WHEN YOU ARE</span><strong>Load the draft, add rubric criteria, then build the matrix.</strong><p>For better results, include criterion names that contain the concepts your lecturer will assess and paste source context in Studio when evidence support matters.</p></section>}
        </div>
      </aside>
    </div>
  );
}
