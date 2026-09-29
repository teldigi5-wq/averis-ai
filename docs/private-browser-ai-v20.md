# Averis Private AI v20

Private AI v20 adds an optional browser-side academic writing model without adding a paid inference service or a new server-side persistence path.

## Runtime

- Library: `@huggingface/transformers` 3.8.1
- Model: `onnx-community/Qwen2.5-0.5B-Instruct`
- Execution: WebGPU in the student's browser
- Model files are fetched on first use and can be cached by the browser.
- The Private AI generation code does not send the student's draft to a remote inference API.
- The existing backend Ollama path remains available separately for stronger local/self-hosted generation.

Private AI is explicitly user-triggered. The model is **not** downloaded automatically when a student merely opens the page.

## Supported v20 tasks

### Coach

Returns a short set of manual revision actions. It is instructed not to rewrite the whole draft, issue plagiarism/misconduct/authorship verdicts, fabricate sources, or optimize for detector evasion.

### Revise

Returns a bounded revision proposal for the student's own text. The UI checks whether recognized author-year citations, numeric citations, numbers/percentages, and DOIs present in the original disappeared from the proposal. A proposal with protected-token loss is placed on hold and cannot be copied through the guarded action.

The preservation check reduces accidental token loss; it does not prove factual correctness, semantic equivalence, citation correctness, or source support.

## Input limit

Private browser generation is capped at 6,000 characters per pass to keep a small browser model and student hardware within a practical review scope. Longer sections remain supported by the existing Revision Studio/Ollama workflow when that runtime is available.

## Cost and privacy boundary

- no paid inference fallback
- no AI API key in the browser
- no new database table, object storage path, or server-side revision history
- no scan-credit consumption
- no automatic cloud-provider fallback
- no automatic acceptance of generated wording

Downloading model files still requires network access to the model host on first use. Browser extensions, device software, and the model host's normal asset-delivery logs are outside Averis' application-level guarantees.

## Academic-integrity boundary

Private AI is a writing assistant, not a detector bypasser. It must not:

- optimize for Turnitin/AI-detector evasion or a lower similarity score
- claim that text is plagiarism-free or misconduct-free
- infer authorship from writing style
- fabricate citations, sources, quotations, facts, grades, or institutional rules
- treat model output as proof that a claim is correct

Students remain responsible for reviewing every generated statement and following their institution's rules.

## Certification gates

Before this branch is considered certified:

1. web TypeScript and production build must pass with the browser inference dependency;
2. API tests, API container smoke, and security gate must remain green;
3. signed-out/local browser-quality coverage must include `/private-ai/` at desktop and mobile widths;
4. accessibility, overflow, broken-image, and keyboard-focus checks must remain green;
5. a real WebGPU model-load/generation smoke must be completed separately on supported hardware before claiming live AI generation is runtime-certified.

The Web Product Quality job intentionally does not download the language model during ordinary CI because model loading is an explicit user action and would make the quality gate depend on a large external model asset.
