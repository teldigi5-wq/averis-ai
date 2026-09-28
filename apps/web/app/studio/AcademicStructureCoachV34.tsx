"use client";

import { useEffect, useMemo, useState } from "react";

export type StructureReadinessSignal = {
  seen: boolean;
  score: number;
  sections: number;
  paragraphs: number;
  transitionGaps: number;
  missingExpected: number;
  highAttention: number;
};

type Severity = "high" | "review" | "info";
type ParagraphRole = "opening" | "background" | "claim" | "evidence" | "analysis" | "counterpoint" | "method" | "results" | "transition" | "conclusion" | "development";

type Finding = { severity: Severity; title: string; detail: string };
type ParagraphMap = { index: number; role: ParagraphRole; words: number; preview: string; section: string; hasCitation: boolean };
type SectionMap = { name: string; words: number; percent: number; paragraphs: number };
type Analysis = {
  score: number;
  words: number;
  sections: SectionMap[];
  paragraphs: ParagraphMap[];
  findings: Finding[];
  transitionGaps: number;
  missingExpected: string[];
  balanceWarnings: number;
  highAttention: number;
};

type Props = { open: boolean; onClose: () => void; expectedSections: string[] };

const EMPTY: Analysis = { score: 0, words: 0, sections: [], paragraphs: [], findings: [], transitionGaps: 0, missingExpected: [], balanceWarnings: 0, highAttention: 0 };
const KNOWN_HEADINGS = ["abstract","executive summary","introduction","background","literature review","methodology","methods","analysis","results","findings","discussion","recommendations","reflection","conclusion","references","appendix"];
const TRANSITIONS = ["however","therefore","furthermore","moreover","consequently","similarly","in contrast","by contrast","in addition","for example","for instance","nevertheless","nonetheless","overall","finally","firstly","secondly","thirdly","meanwhile","thus","hence"];
const STOP = new Set(["the","a","an","and","or","but","if","then","than","that","this","these","those","of","to","in","on","for","with","as","at","by","from","is","are","was","were","be","been","being","it","its","their","there","which","who","when","where","how","why","can","could","should","would","may","might","will","also","not","into","about","between","through","during","such"]);

function compact(value: string) { return value.replace(/\s+/g, " ").trim(); }
function words(value: string) { const text = compact(value); return text ? text.split(" ").length : 0; }
function normalized(value: string) { return compact(value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ")); }
function tokens(value: string) { return normalized(value).split(" ").filter((item) => item.length > 3 && !STOP.has(item)); }
function overlap(a: string, b: string) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let same = 0;
  left.forEach((item) => { if (right.has(item)) same += 1; });
  return same / Math.max(1, Math.min(left.size, right.size));
}
function citationLike(value: string) {
  return /\([A-Z][A-Za-z'-]+(?:\s+et\s+al\.)?,?\s+\d{4}[a-z]?\)|\[[0-9]{1,3}\]|according to|doi\.org/i.test(value);
}
function headingName(line: string) {
  const stripped = compact(line.replace(/^#{1,6}\s*/, "").replace(/^\d+(?:\.\d+)*\s+/, ""));
  const lower = stripped.toLowerCase().replace(/[:.]$/, "");
  if (!stripped || words(stripped) > 10 || stripped.length > 100) return null;
  if (KNOWN_HEADINGS.includes(lower)) return stripped;
  const markdown = /^#{1,6}\s+/.test(line);
  const allCaps = stripped.length >= 4 && stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped);
  const titleish = stripped.split(" ").filter(Boolean).length <= 7 && !/[.!?]$/.test(stripped) && stripped.split(" ").filter((part) => /^[A-Z][A-Za-z0-9&/-]*$/.test(part)).length >= Math.max(1, Math.ceil(stripped.split(" ").length * .6));
  return markdown || allCaps || titleish ? stripped : null;
}
function classifyRole(text: string, section: string, index: number, total: number): ParagraphRole {
  const value = normalized(text);
  const sectionValue = normalized(section);
  if (/method|methodology|procedure|participants|sample/.test(sectionValue) || /\b(method|methodology|participants|sample|procedure|data were collected|survey was conducted)\b/.test(value)) return "method";
  if (/result|finding/.test(sectionValue) || /\b(results?|findings?|revealed|showed|demonstrated|indicated)\b/.test(value)) return "results";
  if (/conclusion|recommendation/.test(sectionValue) || /^(in conclusion|to conclude|in summary|overall|finally)\b/.test(value) || (index === total - 1 && /\btherefore|overall|conclude|recommend/.test(value))) return "conclusion";
  if (index === 0 || /introduction|abstract/.test(sectionValue) || /\b(this essay|this report|this paper|this study|aims? to|purpose of|examines?|explores?)\b/.test(value)) return "opening";
  if (/\b(however|although|despite|nevertheless|on the other hand|in contrast|critics?|limitation)\b/.test(value)) return "counterpoint";
  if (citationLike(text) || /\b(according to|research shows?|studies? found|evidence|data|statistics?|survey|reported)\b/.test(value)) return "evidence";
  if (/\b(this (suggests|indicates|means|implies|demonstrates)|therefore|because|consequently|hence|thus|as a result|can be interpreted)\b/.test(value)) return "analysis";
  if (/\b(argues?|suggests?|should|must|is important|is essential|is significant|demonstrates?)\b/.test(value)) return "claim";
  if (TRANSITIONS.some((item) => value.startsWith(item + " "))) return "transition";
  if (/background|literature review/.test(sectionValue) || /\b(historically|context|previous research|existing literature)\b/.test(value)) return "background";
  return "development";
}

function analyze(text: string, expectedSections: string[]): Analysis {
  const normalizedText = text.replace(/\r/g, "").trim();
  if (!normalizedText) return EMPTY;
  const lines = normalizedText.split("\n");
  const headings = lines.map((line, index) => ({ index, name: headingName(line) })).filter((item): item is { index: number; name: string } => Boolean(item.name));
  const sectionsRaw: { name: string; text: string }[] = [];
  if (headings.length) {
    const firstBody = lines.slice(0, headings[0].index).join("\n").trim();
    if (firstBody) sectionsRaw.push({ name: "Opening", text: firstBody });
    headings.forEach((heading, idx) => {
      const end = headings[idx + 1]?.index ?? lines.length;
      sectionsRaw.push({ name: heading.name, text: lines.slice(heading.index + 1, end).join("\n").trim() });
    });
  } else {
    sectionsRaw.push({ name: "Main draft", text: normalizedText });
  }

  const paragraphRows: { text: string; section: string }[] = [];
  sectionsRaw.forEach((section) => {
    const blocks = section.text.split(/\n\s*\n+/).map((item) => compact(item)).filter((item) => words(item) >= 3);
    const fallback = blocks.length ? blocks : section.text.split(/(?<=[.!?])\s+(?=[A-Z])/).reduce<string[]>((acc, sentence) => {
      const last = acc[acc.length - 1];
      if (!last || words(last) >= 90) acc.push(sentence); else acc[acc.length - 1] = `${last} ${sentence}`;
      return acc;
    }, []).map(compact).filter((item) => words(item) >= 3);
    fallback.forEach((item) => paragraphRows.push({ text: item, section: section.name }));
  });

  const totalWords = words(normalizedText);
  const paragraphs: ParagraphMap[] = paragraphRows.map((row, index) => ({
    index: index + 1,
    role: classifyRole(row.text, row.section, index, paragraphRows.length),
    words: words(row.text),
    preview: row.text.slice(0, 220),
    section: row.section,
    hasCitation: citationLike(row.text),
  }));

  const sectionMap: SectionMap[] = sectionsRaw.filter((section) => words(section.text) > 0).map((section) => {
    const count = words(section.text);
    return { name: section.name, words: count, percent: totalWords ? Math.round((count / totalWords) * 100) : 0, paragraphs: paragraphs.filter((item) => item.section === section.name).length };
  });

  const findings: Finding[] = [];
  let transitionGaps = 0;
  for (let i = 1; i < paragraphRows.length; i += 1) {
    const current = paragraphRows[i];
    const previous = paragraphRows[i - 1];
    if (current.section !== previous.section) continue;
    const start = normalized(current.text).slice(0, 70);
    const explicitTransition = TRANSITIONS.some((item) => start.startsWith(item + " "));
    if (!explicitTransition && overlap(previous.text, current.text) < .08 && words(current.text) >= 20 && words(previous.text) >= 20) transitionGaps += 1;
  }
  if (transitionGaps > 0) findings.push({ severity: transitionGaps >= 4 ? "high" : "review", title: "Paragraph transitions need review", detail: `${transitionGaps} adjacent paragraph${transitionGaps === 1 ? "" : "s"} shift topic with little lexical bridge or explicit transition. Check whether the argument connection is clear.` });

  let balanceWarnings = 0;
  if (sectionMap.length >= 3) {
    sectionMap.forEach((section) => {
      const lower = section.name.toLowerCase();
      if (section.percent >= 60) { balanceWarnings += 1; findings.push({ severity: "review", title: `${section.name} dominates the draft`, detail: `${section.percent}% of draft words are in this section. Verify that the emphasis matches the brief and rubric.` }); }
      if (/introduction|opening/.test(lower) && section.percent > 25) { balanceWarnings += 1; findings.push({ severity: "review", title: "Opening may be over-weighted", detail: `${section.name} uses ${section.percent}% of the draft. Check whether enough space remains for analysis/development.` }); }
      if (/conclusion/.test(lower) && section.percent > 22) { balanceWarnings += 1; findings.push({ severity: "review", title: "Conclusion may be over-weighted", detail: `The conclusion uses ${section.percent}% of the draft. Check that it synthesizes rather than introduces substantial new material.` }); }
    });
  }

  const actualHeadings = headings.map((item) => normalized(item.name));
  const missingExpected = expectedSections.filter((expected) => {
    const target = normalized(expected);
    return target && !actualHeadings.some((actual) => actual.includes(target) || target.includes(actual));
  });
  missingExpected.forEach((section) => findings.push({ severity: "high", title: `Required section not detected: ${section}`, detail: "Assignment Intelligence identified this section in the brief, but a matching heading was not found in the draft. Verify the brief and heading wording manually." }));

  const longParagraphs = paragraphs.filter((item) => item.words > 220).length;
  if (longParagraphs) findings.push({ severity: "review", title: "Very long paragraphs detected", detail: `${longParagraphs} paragraph${longParagraphs === 1 ? " is" : "s are"} over 220 words. Check whether each paragraph has one clear purpose and readable internal progression.` });

  const roles = paragraphs.map((item) => item.role);
  const hasOpening = roles.includes("opening");
  const hasClosing = roles.includes("conclusion");
  const hasEvidenceOrAnalysis = roles.some((role) => role === "evidence" || role === "analysis" || role === "results");
  if (totalWords >= 300 && !hasOpening) findings.push({ severity: "review", title: "Opening purpose signal is weak", detail: "A clear opening purpose/position was not detected. This is not automatically an error—verify against the assignment type." });
  if (totalWords >= 300 && !hasClosing) findings.push({ severity: "review", title: "Closing synthesis signal is weak", detail: "A clear concluding/synthesis role was not detected. Verify whether the assignment format expects one." });
  if (totalWords >= 350 && !hasEvidenceOrAnalysis) findings.push({ severity: "high", title: "Development appears mostly descriptive", detail: "No strong evidence/analysis/result role was detected. Check whether major claims are being interpreted and supported rather than only described." });

  let repetitiveRuns = 0;
  for (let i = 2; i < roles.length; i += 1) if (roles[i] === roles[i - 1] && roles[i] === roles[i - 2] && ["background","claim","development"].includes(roles[i])) repetitiveRuns += 1;
  if (repetitiveRuns) findings.push({ severity: "review", title: "Argument progression may flatten", detail: "Three or more consecutive paragraphs share the same broad role. Check whether claim → evidence → analysis or another purposeful progression is visible." });

  const highAttention = findings.filter((item) => item.severity === "high").length;
  const roleDiversity = new Set(roles).size;
  let score = 100;
  score -= Math.min(30, missingExpected.length * 12);
  score -= Math.min(20, transitionGaps * 4);
  score -= Math.min(18, balanceWarnings * 8);
  score -= Math.min(12, longParagraphs * 4);
  score -= Math.min(12, repetitiveRuns * 4);
  if (totalWords >= 300 && !hasOpening) score -= 6;
  if (totalWords >= 300 && !hasClosing) score -= 6;
  if (totalWords >= 350 && !hasEvidenceOrAnalysis) score -= 12;
  if (paragraphs.length >= 4 && roleDiversity <= 2) score -= 8;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, words: totalWords, sections: sectionMap, paragraphs, findings, transitionGaps, missingExpected, balanceWarnings, highAttention };
}

function roleLabel(role: ParagraphRole) {
  const labels: Record<ParagraphRole, string> = { opening: "Opening", background: "Background", claim: "Claim", evidence: "Evidence", analysis: "Analysis", counterpoint: "Counterpoint", method: "Method", results: "Results", transition: "Transition", conclusion: "Conclusion", development: "Development" };
  return labels[role];
}

export default function AcademicStructureCoachV34({ open, onClose, expectedSections }: Props) {
  const [draft, setDraft] = useState("");
  const [analysis, setAnalysis] = useState<Analysis>(EMPTY);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const roleCounts = useMemo(() => {
    const map = new Map<ParagraphRole, number>();
    analysis.paragraphs.forEach((item) => map.set(item.role, (map.get(item.role) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [analysis.paragraphs]);

  function loadStudioDraft() {
    const original = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]')?.value ?? "";
    setDraft(original);
    if (original.trim()) setAnalysis(analyze(original, expectedSections));
  }
  function runAnalysis() {
    const next = analyze(draft, expectedSections);
    setAnalysis(next);
    if (next.words > 0) {
      const signal: StructureReadinessSignal = { seen: true, score: next.score, sections: next.sections.length, paragraphs: next.paragraphs.length, transitionGaps: next.transitionGaps, missingExpected: next.missingExpected.length, highAttention: next.highAttention };
      window.dispatchEvent(new CustomEvent("averis:structure-coach", { detail: signal }));
    }
  }
  async function copyReport() {
    if (!analysis.words) return;
    const report = [
      "Averis Smart Academic Structure Coach v34",
      `Structure signal: ${analysis.score}/100`,
      `Words: ${analysis.words} · Sections: ${analysis.sections.length} · Paragraphs: ${analysis.paragraphs.length}`,
      `Transition gaps: ${analysis.transitionGaps} · Missing required sections: ${analysis.missingExpected.length} · High-attention findings: ${analysis.highAttention}`,
      "",
      "Findings",
      ...(analysis.findings.length ? analysis.findings.map((item) => `[${item.severity.toUpperCase()}] ${item.title} — ${item.detail}`) : ["No major structural review signals detected by the local heuristics."]),
      "",
      "Section map",
      ...analysis.sections.map((item) => `${item.name}: ${item.words} words (${item.percent}%) · ${item.paragraphs} paragraphs`),
      "",
      "Boundary: Structure signals are local heuristics, not grading or policy judgments. Verify section expectations against the assignment brief and lecturer guidance.",
    ].join("\n");
    try { await navigator.clipboard.writeText(report); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); }
  }

  if (!open) return null;
  const state = analysis.score >= 85 && analysis.highAttention === 0 ? "strong" : analysis.score >= 65 ? "review" : "attention";

  return <div className="structureV34Backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="structureV34Drawer" role="dialog" aria-modal="true" aria-labelledby="structure-v34-title">
      <header className="structureV34Header"><div><span>AVERIS · SMART ACADEMIC STRUCTURE COACH V34</span><h2 id="structure-v34-title">Make the argument easier to follow.</h2><p>Local, deterministic review of sections, paragraph roles, balance and transitions. It does not grade the work or invent required sections.</p></div><button type="button" className="structureV34Close" onClick={onClose} aria-label="Close Smart Academic Structure Coach">×</button></header>
      <div className="structureV34Body">
        <section className="structureV34Input"><div className="structureV34SectionHead"><div><span>01 · DRAFT STRUCTURE</span><strong>Review the current assignment structure</strong></div><small>{draft.length.toLocaleString()} / 20,000</small></div><textarea value={draft} maxLength={20000} onChange={(event) => setDraft(event.target.value)} placeholder="Load the Studio draft or paste the section you want to review…" aria-label="Draft for academic structure review"/><div className="structureV34Actions"><button type="button" onClick={loadStudioDraft}>Load Studio draft</button><button type="button" className="structureV34Primary" onClick={runAnalysis} disabled={draft.trim().length < 80}>Analyze structure</button><button type="button" onClick={copyReport} disabled={!analysis.words}>{copied ? "Report copied" : "Copy report"}</button><span>Browser-only · no AI quota used</span></div></section>
        {expectedSections.length > 0 && <section className="structureV34Expected" aria-label="Assignment structure targets"><div><span>BRIEF-AWARE TARGETS</span><strong>{expectedSections.length} required section{expectedSections.length === 1 ? "" : "s"} captured</strong></div><p>{expectedSections.join(" · ")}</p><small>These came from Assignment Intelligence in this page session. Missing-section warnings are limited to these captured requirements.</small></section>}
        {!analysis.words ? <section className="structureV34Empty"><span>STRUCTURE COACH READY</span><strong>Load or paste a meaningful draft.</strong><p>The coach will map section balance, paragraph roles, progression and transition gaps without sending the text anywhere.</p></section> : <>
          <section className="structureV34Hero" data-state={state}><div><span>STRUCTURE SIGNAL</span><strong>{analysis.score}<small>/100</small></strong><p>{state === "strong" ? "Strong structure signal" : state === "review" ? "Focused review recommended" : "Structural attention needed"}</p></div><div className="structureV34Metrics"><article><span>SECTIONS</span><strong>{analysis.sections.length}</strong><small>Detected structure units</small></article><article><span>PARAGRAPHS</span><strong>{analysis.paragraphs.length}</strong><small>Role-mapped blocks</small></article><article><span>TRANSITION GAPS</span><strong>{analysis.transitionGaps}</strong><small>Adjacent shifts to review</small></article><article><span>REQUIRED MISSING</span><strong>{analysis.missingExpected.length}</strong><small>Only from brief targets</small></article></div></section>
          <section className="structureV34Findings"><div className="structureV34SectionHead"><div><span>02 · PRIORITY REVIEW</span><strong>Structural signals worth checking</strong></div><small>{analysis.findings.length} findings</small></div>{analysis.findings.length ? <div className="structureV34FindingGrid">{analysis.findings.map((item, index) => <article key={`${item.title}-${index}`} data-severity={item.severity}><div><span>{String(index + 1).padStart(2, "0")}</span><b>{item.severity.toUpperCase()}</b></div><strong>{item.title}</strong><p>{item.detail}</p></article>)}</div> : <div className="structureV34AllClear"><span>✓</span><strong>No major structural review signals detected</strong><p>Still compare the structure with your actual brief and lecturer expectations.</p></div>}</section>
          <section className="structureV34Map"><div className="structureV34SectionHead"><div><span>03 · SECTION MAP</span><strong>See where the words are concentrated</strong></div><small>{analysis.words.toLocaleString()} words</small></div><div className="structureV34SectionGrid">{analysis.sections.map((item) => <article key={item.name}><div><strong>{item.name}</strong><b>{item.percent}%</b></div><div className="structureV34Track" aria-hidden="true"><i style={{ width: `${Math.min(100, item.percent)}%` }}/></div><p>{item.words.toLocaleString()} words · {item.paragraphs} paragraph{item.paragraphs === 1 ? "" : "s"}</p></article>)}</div></section>
          <section className="structureV34Roles"><div className="structureV34SectionHead"><div><span>04 · PARAGRAPH ROLE MAP</span><strong>Check the progression of the argument</strong></div><small>{roleCounts.map(([role, count]) => `${roleLabel(role)} ${count}`).slice(0, 3).join(" · ")}</small></div><div className="structureV34RoleList">{analysis.paragraphs.map((item) => <article key={item.index} data-role={item.role}><span>{String(item.index).padStart(2, "0")}</span><div><div><strong>{roleLabel(item.role)}</strong><b>{item.section}</b>{item.hasCitation && <em>CITATION</em>}</div><p>{item.preview}{item.preview.length >= 220 ? "…" : ""}</p></div><small>{item.words}w</small></article>)}</div></section>
          <p className="structureV34Boundary">This tool reviews visible structural patterns only. It does not predict marks, Turnitin/AI-detector outcomes, or whether a lecturer will accept a structure. Required-section warnings only use targets captured from the assignment brief.</p>
        </>}
      </div>
    </aside>
  </div>;
}
