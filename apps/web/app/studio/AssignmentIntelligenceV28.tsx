"use client";

import { useEffect, useMemo, useState } from "react";

type Requirement = {
  id: string;
  category: "length" | "deadline" | "citation" | "section" | "deliverable" | "format" | "sources";
  label: string;
  detail: string;
};

type RubricItem = {
  label: string;
  weight: number;
};

type BriefAnalysis = {
  wordMin: number | null;
  wordMax: number | null;
  wordTarget: number | null;
  deadline: string | null;
  citationStyle: string | null;
  minSources: number | null;
  formats: string[];
  sections: string[];
  rubric: RubricItem[];
  deliverables: string[];
  policyNotes: string[];
  requirements: Requirement[];
};

type AssignmentIntelligenceV28Props = {
  open: boolean;
  onClose: () => void;
  currentDraftWords: number;
};

const EMPTY_ANALYSIS: BriefAnalysis = {
  wordMin: null,
  wordMax: null,
  wordTarget: null,
  deadline: null,
  citationStyle: null,
  minSources: null,
  formats: [],
  sections: [],
  rubric: [],
  deliverables: [],
  policyNotes: [],
  requirements: [],
};

const SECTION_NAMES = [
  "abstract",
  "executive summary",
  "introduction",
  "background",
  "literature review",
  "methodology",
  "methods",
  "analysis",
  "results",
  "discussion",
  "recommendations",
  "reflection",
  "conclusion",
  "references",
  "appendix",
];

const CITATION_STYLES = ["APA 7", "APA", "Harvard", "IEEE", "Vancouver", "MLA", "Chicago", "OSCOLA"];
const FORMAT_NAMES = ["PDF", "DOCX", "DOC", "PPTX", "PPT", "ZIP", "XLSX"];

function cleanLine(value: string) {
  return value.replace(/^[\s•\-*\d.)]+/, "").replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function analyzeBrief(text: string): BriefAnalysis {
  const normalized = text.replace(/\r/g, "");
  const lines = normalized.split("\n").map(cleanLine).filter(Boolean);
  const flattened = compact(normalized);

  let wordMin: number | null = null;
  let wordMax: number | null = null;
  let wordTarget: number | null = null;

  const rangeMatch = flattened.match(/(?:word\s*(?:count|limit)|length)?[^\d]{0,24}(\d{3,5})\s*(?:-|–|to)\s*(\d{3,5})\s*words?/i);
  if (rangeMatch) {
    const first = Number(rangeMatch[1]);
    const second = Number(rangeMatch[2]);
    wordMin = Math.min(first, second);
    wordMax = Math.max(first, second);
    wordTarget = Math.round((wordMin + wordMax) / 2);
  } else {
    const targetMatch = flattened.match(/(?:word\s*(?:count|limit)|length)\s*[:\-]?\s*(?:approximately\s*|about\s*)?(\d{3,5})\s*words?/i)
      ?? flattened.match(/\b(\d{3,5})\s*words?\b/i);
    if (targetMatch) {
      wordTarget = Number(targetMatch[1]);
      wordMin = wordTarget;
      wordMax = wordTarget;
    }
  }

  const deadline = lines.find((line) => /\b(due|deadline|submission date|submit by|due date)\b/i.test(line))?.slice(0, 180) ?? null;

  const citationStyle = CITATION_STYLES.find((style) => {
    if (style === "APA") return /\bAPA\b/i.test(flattened);
    return new RegExp(`\\b${style.replace(" ", "\\s*")}\\b`, "i").test(flattened);
  }) ?? null;

  const minSourceMatch = flattened.match(/(?:at least|min(?:imum)?(?:\s+of)?|no fewer than)\s+(\d{1,2})\s+(?:peer[- ]reviewed\s+|academic\s+|scholarly\s+)?(?:sources|references|articles|journals?)/i);
  const minSources = minSourceMatch ? Number(minSourceMatch[1]) : null;

  const formats = FORMAT_NAMES.filter((format) => new RegExp(`(?:\\.|\\b)${format}\\b`, "i").test(flattened));
  if (/\bMicrosoft Word\b|\bWord document\b/i.test(flattened) && !formats.includes("DOCX")) formats.push("DOCX");

  const sections = SECTION_NAMES.filter((section) => new RegExp(`\\b${section.replace(" ", "\\s+")}\\b`, "i").test(flattened));

  const rubric: RubricItem[] = [];
  for (const line of lines) {
    const percent = line.match(/^(.*?)(?:\s*[:\-–]\s*|\s+)(\d{1,3})\s*%\b/);
    const marks = line.match(/^(.*?)(?:\s*[:\-–]\s*|\s+)(\d{1,3})\s*(?:marks?|points?)\b/i);
    const match = percent ?? marks;
    if (!match) continue;
    const label = cleanLine(match[1]).slice(0, 100) || "Rubric criterion";
    const weight = Number(match[2]);
    if (weight > 0 && weight <= 100 && !rubric.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      rubric.push({ label, weight });
    }
    if (rubric.length >= 12) break;
  }

  const deliverables = unique(lines.filter((line) => {
    if (line.length < 8 || line.length > 220) return false;
    if (/\b(due|deadline|word count|word limit|academic integrity|plagiarism|generative ai|turnitin)\b/i.test(line)) return false;
    return /\b(must|required|submit|include|attach|provide|prepare|create|write|develop|evaluate|analyse|analyze|compare|discuss|explain|design|implement)\b/i.test(line);
  })).slice(0, 10);

  const policyNotes = unique(lines.filter((line) => /\b(academic integrity|plagiarism|generative ai|artificial intelligence|ai use|turnitin|collusion|citation policy)\b/i.test(line))).slice(0, 6);

  const requirements: Requirement[] = [];
  const pushRequirement = (category: Requirement["category"], label: string, detail: string) => {
    const key = `${category}-${label}-${detail}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 90);
    if (!requirements.some((item) => item.id === key)) requirements.push({ id: key, category, label, detail });
  };

  if (wordTarget) {
    pushRequirement(
      "length",
      "Meet the assignment length",
      wordMin !== null && wordMax !== null && wordMin !== wordMax
        ? `${wordMin.toLocaleString()}–${wordMax.toLocaleString()} words`
        : `${wordTarget.toLocaleString()} words`,
    );
  }
  if (deadline) pushRequirement("deadline", "Confirm the submission deadline", deadline);
  if (citationStyle) pushRequirement("citation", `Use ${citationStyle} consistently`, "Check in-text citations and the reference list against the required style.");
  if (minSources) pushRequirement("sources", `Use at least ${minSources} sources`, "Verify that each source is relevant, correctly cited, and included in the bibliography.");
  sections.slice(0, 10).forEach((section) => pushRequirement("section", `Include ${section}`, "Check that the section is present and answers the brief."));
  deliverables.forEach((item) => pushRequirement("deliverable", "Brief requirement", item));
  if (formats.length) pushRequirement("format", `Submit in ${formats.join(" / ")}`, "Confirm the final file type before upload.");

  return {
    wordMin,
    wordMax,
    wordTarget,
    deadline,
    citationStyle,
    minSources,
    formats,
    sections,
    rubric,
    deliverables,
    policyNotes,
    requirements: requirements.slice(0, 24),
  };
}

function categoryLabel(category: Requirement["category"]) {
  const labels: Record<Requirement["category"], string> = {
    length: "Length",
    deadline: "Deadline",
    citation: "Citation",
    section: "Section",
    deliverable: "Task",
    format: "Format",
    sources: "Sources",
  };
  return labels[category];
}

export default function AssignmentIntelligenceV28({ open, onClose, currentDraftWords }: AssignmentIntelligenceV28Props) {
  const [brief, setBrief] = useState("");
  const [analysis, setAnalysis] = useState<BriefAnalysis>(EMPTY_ANALYSIS);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
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

  const requirementProgress = useMemo(() => {
    if (!analysis.requirements.length) return 0;
    const done = analysis.requirements.filter((item) => completed[item.id]).length;
    return Math.round((done / analysis.requirements.length) * 100);
  }, [analysis.requirements, completed]);

  const draftDelta = analysis.wordTarget === null ? null : analysis.wordTarget - currentDraftWords;
  const rubricTotal = analysis.rubric.reduce((sum, item) => sum + item.weight, 0);

  function runAnalysis() {
    const next = analyzeBrief(brief);
    setAnalysis(next);
    setCompleted({});
    setCopied(false);
  }

  function clearBrief() {
    setBrief("");
    setAnalysis(EMPTY_ANALYSIS);
    setCompleted({});
    setCopied(false);
  }

  function applyWordTarget() {
    if (!analysis.wordTarget) return;
    window.dispatchEvent(new CustomEvent("averis:assignment-word-target", { detail: { target: analysis.wordTarget } }));
  }

  async function copyChecklist() {
    if (!analysis.requirements.length) return;
    const rows = analysis.requirements.map((item) => `${completed[item.id] ? "[x]" : "[ ]"} ${item.label} — ${item.detail}`);
    const header = [
      "Averis Assignment Intelligence checklist",
      analysis.wordTarget ? `Word target: ${analysis.wordTarget}` : null,
      analysis.deadline ? `Deadline: ${analysis.deadline}` : null,
      analysis.citationStyle ? `Citation style: ${analysis.citationStyle}` : null,
      "",
    ].filter((item): item is string => item !== null);
    await navigator.clipboard.writeText([...header, ...rows].join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!open) return null;

  const hasAnalysis = analysis.requirements.length > 0 || analysis.rubric.length > 0 || analysis.policyNotes.length > 0;

  return (
    <div className="assignmentV28Backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="assignmentV28Drawer" role="dialog" aria-modal="true" aria-labelledby="assignment-v28-title">
        <header className="assignmentV28Header">
          <div>
            <span>AVERIS · ASSIGNMENT INTELLIGENCE V28</span>
            <h2 id="assignment-v28-title">Turn the brief into a working plan.</h2>
            <p>Runs locally in this browser. Nothing in the brief is sent to Averis, Groq, Azure, or Supabase.</p>
          </div>
          <button type="button" className="assignmentV28Close" onClick={onClose} aria-label="Close Assignment Intelligence">×</button>
        </header>

        <div className="assignmentV28Body">
          <section className="assignmentV28Input">
            <div className="assignmentV28SectionHead">
              <div><span>01 · BRIEF / RUBRIC</span><strong>Paste the assignment instructions</strong></div>
              <small>{brief.length.toLocaleString()} / 16,000</small>
            </div>
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              maxLength={16000}
              placeholder="Paste the assignment brief, marking rubric, submission requirements, word limit, citation style, and deadline…"
              aria-label="Assignment brief and rubric"
            />
            <div className="assignmentV28InputActions">
              <button type="button" onClick={runAnalysis} disabled={brief.trim().length < 20}>Extract requirements</button>
              <button type="button" onClick={clearBrief} disabled={!brief}>Clear</button>
              <span>Deterministic browser analysis · zero AI quota used</span>
            </div>
          </section>

          {hasAnalysis ? (
            <>
              <section className="assignmentV28Snapshot" aria-label="Assignment requirement snapshot">
                <article><span>WORD TARGET</span><strong>{analysis.wordTarget?.toLocaleString() ?? "Not found"}</strong><small>{draftDelta === null ? "Add a word limit in the brief" : draftDelta >= 0 ? `${draftDelta.toLocaleString()} words remaining from current draft` : `${Math.abs(draftDelta).toLocaleString()} words over target`}</small>{analysis.wordTarget && <button type="button" onClick={applyWordTarget}>Apply to Studio</button>}</article>
                <article><span>CITATION STYLE</span><strong>{analysis.citationStyle ?? "Not found"}</strong><small>{analysis.minSources ? `Minimum ${analysis.minSources} sources detected` : "Check the brief if a style is required"}</small></article>
                <article><span>DEADLINE</span><strong>{analysis.deadline ? "Detected" : "Not found"}</strong><small>{analysis.deadline ?? "No due-date line detected"}</small></article>
                <article><span>RUBRIC</span><strong>{analysis.rubric.length ? `${analysis.rubric.length} criteria` : "Not found"}</strong><small>{analysis.rubric.length ? `${rubricTotal} total ${analysis.rubric.some((item) => item.weight) ? "weight/marks" : "items"}` : "Paste rubric rows with percentages or marks"}</small></article>
              </section>

              {analysis.rubric.length > 0 && (
                <section className="assignmentV28Rubric">
                  <div className="assignmentV28SectionHead"><div><span>02 · RUBRIC MAP</span><strong>See where the marks are concentrated</strong></div><small>{rubricTotal}{analysis.rubric.some((item) => item.weight) ? " total" : ""}</small></div>
                  <div className="assignmentV28RubricList">
                    {analysis.rubric.map((item, index) => (
                      <article key={`${item.label}-${index}`}>
                        <div><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.label}</strong><b>{item.weight}</b></div>
                        <div className="assignmentV28RubricTrack" aria-hidden="true"><i style={{ width: `${Math.min(100, item.weight)}%` }} /></div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="assignmentV28Checklist">
                <div className="assignmentV28SectionHead">
                  <div><span>03 · REQUIREMENTS</span><strong>Submission checklist</strong></div>
                  <div className="assignmentV28Progress"><b>{requirementProgress}%</b><span>checked</span></div>
                </div>
                <div className="assignmentV28ChecklistTrack" role="progressbar" aria-label="Assignment checklist completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={requirementProgress}><i style={{ width: `${requirementProgress}%` }} /></div>
                <div className="assignmentV28Requirements">
                  {analysis.requirements.map((item) => (
                    <label key={item.id} className={completed[item.id] ? "assignmentV28Requirement isDone" : "assignmentV28Requirement"}>
                      <input type="checkbox" checked={Boolean(completed[item.id])} onChange={(event) => setCompleted((current) => ({ ...current, [item.id]: event.target.checked }))} />
                      <span><em>{categoryLabel(item.category)}</em><strong>{item.label}</strong><small>{item.detail}</small></span>
                    </label>
                  ))}
                </div>
                <button type="button" className="assignmentV28Copy" onClick={copyChecklist}>{copied ? "Checklist copied" : "Copy checklist"}</button>
              </section>

              {analysis.policyNotes.length > 0 && (
                <section className="assignmentV28Policy">
                  <div className="assignmentV28SectionHead"><div><span>04 · POLICY NOTES</span><strong>Institutional requirements to review manually</strong></div></div>
                  {analysis.policyNotes.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}
                  <small>Averis surfaces policy text but does not reinterpret it as permission to conceal AI use, bypass originality systems, or ignore your institution’s rules.</small>
                </section>
              )}
            </>
          ) : (
            <section className="assignmentV28Empty">
              <span>BRIEF INTELLIGENCE</span>
              <strong>Paste the brief to build your assignment map.</strong>
              <p>Best results include the word limit, due date, rubric or marking scheme, required sections, citation style, reference minimums, file format, and submission instructions.</p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
