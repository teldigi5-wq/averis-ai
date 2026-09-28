"use client";

import { useEffect, useMemo, useState } from "react";

export type DocumentQualitySignal = {
  seen: boolean;
  score: number;
  issues: number;
  highAttention: number;
  structureWarnings: number;
  consistencyWarnings: number;
};

type Finding = {
  id: string;
  area: string;
  severity: "high" | "review" | "info";
  title: string;
  detail: string;
};

type Analysis = {
  score: number;
  words: number;
  sentences: number;
  paragraphs: number;
  headings: string[];
  longParagraphs: number;
  shortParagraphs: number;
  longSentences: number;
  undefinedAcronyms: string[];
  repeatedStarts: string[];
  repeatedPhrases: string[];
  duplicateParagraphs: number;
  numberingMixed: boolean;
  figures: number[];
  tables: number[];
  spacingIssues: number;
  findings: Finding[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSignal: (signal: DocumentQualitySignal) => void;
};

const COMMON_ACRONYMS = new Set(["AI", "API", "PDF", "URL", "DOI", "HTTP", "HTTPS", "CPU", "GPU", "RAM", "USB", "HTML", "CSS", "SQL", "IT"]);
const STOP_WORDS = new Set(["the", "and", "that", "this", "with", "from", "into", "have", "has", "had", "for", "are", "was", "were", "but", "not", "their", "there", "they", "them", "than", "then", "also", "can", "could", "should", "would", "about", "between", "within", "through", "because", "while", "where", "which", "when", "what", "who", "how", "our", "your", "its", "his", "her", "these", "those", "been", "being", "more", "most", "such", "only", "very", "each", "both", "some", "many", "much", "will"]);
const KNOWN_HEADINGS = ["abstract", "executive summary", "introduction", "background", "literature review", "methodology", "methods", "analysis", "results", "discussion", "recommendations", "reflection", "conclusion", "references", "bibliography", "appendix"];

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function wordCount(value: string) {
  const cleaned = compact(value);
  return cleaned ? cleaned.split(" ").length : 0;
}

function currentStudioDraft() {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("section,article,div"));
  const accepted = nodes.find((element) => compact(element.textContent ?? "").includes("ACCEPTED DRAFT PREVIEW"));
  const acceptedText = accepted?.querySelector<HTMLElement>("pre,p,[data-draft]")?.textContent ?? "";
  if (compact(acceptedText).length >= 50) return acceptedText.trim();
  return document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]')?.value ?? "";
}

function sentenceList(text: string) {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(compact)
    .filter((item) => item.length > 2);
}

function paragraphList(text: string) {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n+/).map(compact).filter(Boolean);
  if (blocks.length > 1) return blocks;
  const lines = text.split("\n").map(compact).filter(Boolean);
  return lines.length > 1 ? lines : blocks;
}

function looksLikeHeading(line: string) {
  const value = compact(line);
  if (!value || value.length > 100 || wordCount(value) > 12 || /[.!?]$/.test(value)) return false;
  const withoutNumber = value.replace(/^\d+(?:\.\d+)*[.)]?\s*/, "");
  const lower = withoutNumber.toLowerCase();
  if (KNOWN_HEADINGS.some((heading) => lower === heading || lower.startsWith(`${heading}:`))) return true;
  if (/^[A-Z0-9][A-Z0-9 &:/-]{3,}$/.test(withoutNumber)) return true;
  const words = withoutNumber.split(/\s+/);
  const titleWords = words.filter((word) => /^[A-Z][A-Za-z'’-]*$/.test(word)).length;
  return words.length >= 2 && titleWords / words.length >= 0.75;
}

function extractHeadings(text: string) {
  return text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(looksLikeHeading).slice(0, 40);
}

function acronymDefined(text: string, acronym: string) {
  const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const longThenShort = new RegExp(`[A-Z][A-Za-z-]+(?:\\s+[A-Za-z][A-Za-z-]+){1,7}\\s*\\(${escaped}\\)`, "i");
  const shortThenLong = new RegExp(`\\b${escaped}\\b\\s*\\([A-Za-z][^)]{4,80}\\)`, "i");
  return longThenShort.test(text) || shortThenLong.test(text);
}

function findUndefinedAcronyms(text: string) {
  const acronyms = [...new Set(text.match(/\b[A-Z][A-Z0-9]{1,6}\b/g) ?? [])]
    .filter((item) => !COMMON_ACRONYMS.has(item) && !/^\d/.test(item));
  return acronyms.filter((item) => !acronymDefined(text, item)).slice(0, 12);
}

function repeatedSentenceStarts(sentences: string[]) {
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    const key = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
    if (key.split(" ").length < 3) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, count]) => `“${key}…” ×${count}`);
}

function repeatedPhrases(text: string) {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((token) => token.length > 2);
  const counts = new Map<string, number>();
  for (let index = 0; index <= tokens.length - 4; index += 1) {
    const group = tokens.slice(index, index + 4);
    if (group.filter((token) => !STOP_WORDS.has(token)).length < 2) continue;
    const phrase = group.join(" ");
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([phrase, count]) => `“${phrase}” ×${count}`);
}

function duplicateParagraphCount(paragraphs: string[]) {
  const seen = new Map<string, number>();
  for (const paragraph of paragraphs) {
    if (wordCount(paragraph) < 12) continue;
    const key = paragraph.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function sequenceNumbers(text: string, label: "Figure" | "Table") {
  const regex = new RegExp(`\\b${label}\\s+(\\d+)\\b`, "gi");
  const numbers: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) numbers.push(Number(match[1]));
  return [...new Set(numbers)].sort((a, b) => a - b);
}

function hasSequenceGap(values: number[]) {
  if (values.length < 2) return false;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] - values[index - 1] > 1) return true;
  }
  return false;
}

function analyzeDocument(text: string): Analysis {
  const words = wordCount(text);
  const sentences = sentenceList(text);
  const paragraphs = paragraphList(text);
  const headings = extractHeadings(text);
  const paragraphWords = paragraphs.map(wordCount);
  const longParagraphs = paragraphWords.filter((count) => count > 220).length;
  const shortParagraphs = paragraphs.length >= 4 ? paragraphWords.filter((count) => count > 0 && count < 22).length : 0;
  const longSentences = sentences.filter((sentence) => wordCount(sentence) > 36).length;
  const undefinedAcronyms = findUndefinedAcronyms(text);
  const repeatedStarts = repeatedSentenceStarts(sentences);
  const repeated = repeatedPhrases(text);
  const duplicateParagraphs = duplicateParagraphCount(paragraphs);
  const numberStyles = new Set(
    text.split("\n").map((line) => line.match(/^\s*\d+(?:\.\d+)*(\.|\))\s+/)?.[1]).filter((item): item is string => Boolean(item)),
  );
  const numberingMixed = numberStyles.size > 1;
  const figures = sequenceNumbers(text, "Figure");
  const tables = sequenceNumbers(text, "Table");
  const spacingIssues = (text.match(/ {2,}/g)?.length ?? 0) + (text.match(/\t+/g)?.length ?? 0) + (text.match(/\n{4,}/g)?.length ?? 0);

  const findings: Finding[] = [];
  const push = (area: string, severity: Finding["severity"], title: string, detail: string) => findings.push({ id: `${area}-${findings.length}`, area, severity, title, detail });

  if (words < 50) push("Coverage", "high", "Not enough text for a reliable document review", "Load a larger assignment section or the accepted draft before using this score.");
  if (words >= 350 && headings.length === 0) push("Structure", "review", "No clear headings detected", "For a longer assignment, check whether section headings would make the argument easier to navigate and whether the brief expects named sections.");
  if (words >= 500 && !headings.some((heading) => /introduction/i.test(heading))) push("Structure", "info", "Introduction heading not detected", "This can be valid for some assignment types; compare the document structure with the rubric before adding a heading.");
  if (words >= 500 && !headings.some((heading) => /conclusion/i.test(heading))) push("Structure", "info", "Conclusion heading not detected", "Check whether the assignment expects a distinct conclusion or closing synthesis.");
  if (longParagraphs) push("Paragraphs", longParagraphs >= 3 ? "high" : "review", `${longParagraphs} very long paragraph${longParagraphs === 1 ? "" : "s"}`, "Paragraphs above roughly 220 words can hide topic shifts. Check whether each paragraph has one clear purpose and evidence chain.");
  if (shortParagraphs >= 3) push("Paragraphs", "review", `${shortParagraphs} very short paragraphs`, "Several sub-22-word paragraphs may make academic prose feel fragmented unless they are intentional transitions, labels, or list items.");
  if (longSentences) push("Sentences", longSentences >= 4 ? "high" : "review", `${longSentences} sentence${longSentences === 1 ? "" : "s"} above 36 words`, "Check clause load, punctuation, and whether one sentence is carrying more than one main claim.");
  if (undefinedAcronyms.length) push("Acronyms", "review", `${undefinedAcronyms.length} acronym${undefinedAcronyms.length === 1 ? "" : "s"} may need first-use definitions`, undefinedAcronyms.join(", "));
  if (repeatedStarts.length) push("Flow", "review", "Several sentences begin the same way", repeatedStarts.join(" · "));
  if (repeated.length) push("Repetition", "review", "Repeated four-word clusters detected", repeated.join(" · "));
  if (duplicateParagraphs) push("Duplication", "high", `${duplicateParagraphs} duplicate paragraph${duplicateParagraphs === 1 ? "" : "s"} detected`, "Check for accidental copy/paste duplication before submission.");
  if (numberingMixed) push("Numbering", "review", "Mixed numbered-list punctuation detected", "The document uses both “1.” and “1)” list styles. Check the required style and make numbering consistent.");
  if (hasSequenceGap(figures)) push("Figures", "review", "Figure numbering has a gap", `Detected figure numbers: ${figures.join(", ")}. Verify captions and cross-references in the final file.`);
  if (hasSequenceGap(tables)) push("Tables", "review", "Table numbering has a gap", `Detected table numbers: ${tables.join(", ")}. Verify captions and cross-references in the final file.`);
  if (spacingIssues >= 3) push("Formatting", "review", `${spacingIssues} spacing-hygiene signals`, "Repeated spaces, tabs, or large blank-line runs were detected. Clean these in the final document editor before export.");

  let deduction = 0;
  for (const finding of findings) deduction += finding.severity === "high" ? 14 : finding.severity === "review" ? 7 : 2;
  const score = words < 50 ? Math.min(55, Math.max(0, 100 - deduction)) : Math.max(0, Math.min(100, 100 - deduction));

  return {
    score,
    words,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    headings,
    longParagraphs,
    shortParagraphs,
    longSentences,
    undefinedAcronyms,
    repeatedStarts,
    repeatedPhrases: repeated,
    duplicateParagraphs,
    numberingMixed,
    figures,
    tables,
    spacingIssues,
    findings,
  };
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function DocumentQualityCenterV32({ open, onClose, onSignal }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const report = useMemo(() => {
    if (!result) return "";
    return [
      "Averis Student Document Quality Center v32",
      `Document quality signal: ${result.score}/100`,
      `Words: ${result.words}`,
      `Paragraphs: ${result.paragraphs}`,
      `Sentences: ${result.sentences}`,
      `Headings detected: ${result.headings.length}`,
      `Long paragraphs: ${result.longParagraphs}`,
      `Long sentences: ${result.longSentences}`,
      `Undefined acronym signals: ${result.undefinedAcronyms.length}`,
      `Duplicate paragraphs: ${result.duplicateParagraphs}`,
      "",
      "Review findings",
      ...(result.findings.length ? result.findings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.title} — ${finding.detail}`) : ["- No major document-quality signals detected."]),
      "",
      "Boundary: This is a deterministic writing/format hygiene review. Verify required structure, formatting, figures, tables, headings and submission rules against the original university brief and final exported file.",
    ].join("\n");
  }, [result]);

  function runAnalysis(nextText = text) {
    const analysis = analyzeDocument(nextText);
    setResult(analysis);
    onSignal({
      seen: true,
      score: analysis.score,
      issues: analysis.findings.length,
      highAttention: analysis.findings.filter((finding) => finding.severity === "high").length,
      structureWarnings: analysis.findings.filter((finding) => finding.area === "Structure" || finding.area === "Paragraphs" || finding.area === "Numbering").length,
      consistencyWarnings: analysis.findings.filter((finding) => ["Acronyms", "Flow", "Repetition", "Formatting", "Figures", "Tables"].includes(finding.area)).length,
    });
  }

  function loadStudio() {
    const next = currentStudioDraft();
    setText(next);
    setResult(null);
    if (compact(next).length >= 50) window.setTimeout(() => runAnalysis(next), 0);
  }

  async function copyReport() {
    const ok = await copyText(report);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!open) return null;

  return (
    <div className="qualityV32Backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="qualityV32Drawer" role="dialog" aria-modal="true" aria-labelledby="quality-v32-title">
        <header className="qualityV32Header">
          <div>
            <span>AVERIS · STUDENT DOCUMENT QUALITY CENTER V32</span>
            <h2 id="quality-v32-title">Polish the document before the final export.</h2>
            <p>Local checks for structure, paragraph balance, sentence load, repetition, acronyms, numbering, figure/table references and spacing hygiene. No AI quota or backend call is used.</p>
          </div>
          <button type="button" className="qualityV32Close" onClick={onClose} aria-label="Close Student Document Quality Center">×</button>
        </header>

        <div className="qualityV32Body">
          <section className="qualityV32Input">
            <div className="qualityV32SectionHead"><div><span>01 · DOCUMENT TEXT</span><strong>Review the current assignment draft</strong></div><small>{wordCount(text).toLocaleString()} words</small></div>
            <textarea value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} maxLength={50000} placeholder="Load the current Studio draft or paste the text you want to quality-check…" aria-label="Document text for quality review" />
            <div className="qualityV32InputActions">
              <button type="button" onClick={loadStudio}>Load current Studio draft</button>
              <button type="button" className="qualityV32Primary" onClick={() => runAnalysis()} disabled={compact(text).length < 20}>Analyze document</button>
              <span>Browser-only analysis · nothing is uploaded</span>
            </div>
          </section>

          {!result ? (
            <section className="qualityV32Empty"><span>DOCUMENT HYGIENE</span><strong>Catch avoidable presentation problems before submission.</strong><p>Use this after the main writing and source checks. It focuses on consistency and readability signals that are easy to miss when working on a long assignment.</p></section>
          ) : (
            <>
              <section className="qualityV32Hero" data-state={result.score >= 88 ? "strong" : result.score >= 70 ? "review" : "attention"}>
                <div><span>QUALITY SIGNAL</span><strong>{result.score}<small>/100</small></strong><p>{result.score >= 88 ? "Clean document signal" : result.score >= 70 ? "A few areas need review" : "Focused cleanup recommended"}</p></div>
                <div className="qualityV32Metrics">
                  <article><span>PARAGRAPHS</span><strong>{result.paragraphs}</strong><small>{result.longParagraphs} very long</small></article>
                  <article><span>HEADINGS</span><strong>{result.headings.length}</strong><small>structure signals</small></article>
                  <article><span>LONG SENTENCES</span><strong>{result.longSentences}</strong><small>&gt;36 words</small></article>
                  <article><span>ACRONYMS</span><strong>{result.undefinedAcronyms.length}</strong><small>may need definitions</small></article>
                  <article><span>FIGURES / TABLES</span><strong>{result.figures.length + result.tables.length}</strong><small>numbered references</small></article>
                  <article><span>FINDINGS</span><strong>{result.findings.length}</strong><small>{result.findings.filter((finding) => finding.severity === "high").length} high attention</small></article>
                </div>
              </section>

              <section className="qualityV32Findings">
                <div className="qualityV32SectionHead"><div><span>02 · REVIEW QUEUE</span><strong>Work through the highest-value cleanup first</strong></div><button type="button" onClick={copyReport}>{copied ? "Report copied" : "Copy quality report"}</button></div>
                {result.findings.length ? (
                  <div className="qualityV32FindingGrid">
                    {result.findings.map((finding, index) => (
                      <article key={finding.id} data-severity={finding.severity}>
                        <div><span>{String(index + 1).padStart(2, "0")}</span><b>{finding.area}</b><em>{finding.severity === "high" ? "HIGH" : finding.severity === "review" ? "REVIEW" : "NOTE"}</em></div>
                        <strong>{finding.title}</strong>
                        <p>{finding.detail}</p>
                      </article>
                    ))}
                  </div>
                ) : <div className="qualityV32AllClear"><span>✓</span><strong>No major document-quality signals detected.</strong><p>Still compare the exported file with your assignment brief and institutional formatting rules before upload.</p></div>}
              </section>

              <section className="qualityV32Map">
                <div className="qualityV32SectionHead"><div><span>03 · DOCUMENT MAP</span><strong>Structure and consistency snapshot</strong></div><small>heuristic review</small></div>
                <div className="qualityV32MapGrid">
                  <article><span>HEADINGS DETECTED</span><div>{result.headings.length ? result.headings.slice(0, 12).map((heading) => <p key={heading}>{heading}</p>) : <p>No clear headings detected.</p>}</div></article>
                  <article><span>REPEATED SENTENCE STARTS</span><div>{result.repeatedStarts.length ? result.repeatedStarts.map((item) => <p key={item}>{item}</p>) : <p>No strong repeated-start pattern detected.</p>}</div></article>
                  <article><span>REPEATED PHRASES</span><div>{result.repeatedPhrases.length ? result.repeatedPhrases.map((item) => <p key={item}>{item}</p>) : <p>No strong repeated four-word cluster detected.</p>}</div></article>
                  <article><span>NUMBERED OBJECTS</span><div><p>Figures: {result.figures.length ? result.figures.join(", ") : "none detected"}</p><p>Tables: {result.tables.length ? result.tables.join(", ") : "none detected"}</p></div></article>
                </div>
              </section>
            </>
          )}

          <p className="qualityV32Boundary">Document Quality Center does not grade the assignment, infer academic misconduct, predict originality/AI-detector results, or replace the required university template. It only surfaces local writing and formatting consistency signals for human review.</p>
        </div>
      </aside>
    </div>
  );
}
