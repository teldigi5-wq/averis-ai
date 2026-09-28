export const BROWSER_AI_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
export const BROWSER_AI_MAX_CHARS = 6_000;

export type BrowserAiProgress = {
  status: "idle" | "loading" | "ready" | "generating";
  label: string;
  percent: number | null;
};

type RevisionRequest = {
  text: string;
  goal: string;
  strength: "light" | "balanced";
  onProgress?: (progress: BrowserAiProgress) => void;
};

type BrowserGenerator = (
  input: Array<{ role: "system" | "user"; content: string }>,
  options: Record<string, unknown>,
) => Promise<unknown>;

let generatorPromise: Promise<BrowserGenerator> | null = null;

export function browserAiCapability() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "Browser AI is only available in the browser." };
  }
  const nav = navigator as Navigator & { gpu?: unknown };
  if (!nav.gpu) {
    return {
      supported: false,
      reason: "WebGPU is not available in this browser/device. Use the existing Ollama runtime instead.",
    };
  }
  return { supported: true, reason: null };
}

function progressPercent(event: unknown): number | null {
  if (!event || typeof event !== "object") return null;
  const value = event as { progress?: unknown; loaded?: unknown; total?: unknown };
  if (typeof value.progress === "number" && Number.isFinite(value.progress)) {
    const normalized = value.progress <= 1 ? value.progress * 100 : value.progress;
    return Math.max(0, Math.min(100, Math.round(normalized)));
  }
  if (typeof value.loaded === "number" && typeof value.total === "number" && value.total > 0) {
    return Math.max(0, Math.min(100, Math.round((value.loaded / value.total) * 100)));
  }
  return null;
}

function progressLabel(event: unknown) {
  if (!event || typeof event !== "object") return "Loading private AI model…";
  const value = event as { status?: unknown; file?: unknown; name?: unknown };
  if (typeof value.file === "string" && value.file) return `Loading ${value.file}`;
  if (typeof value.name === "string" && value.name) return `Loading ${value.name}`;
  if (typeof value.status === "string" && value.status) return `AI model: ${value.status}`;
  return "Loading private AI model…";
}

async function getGenerator(onProgress?: RevisionRequest["onProgress"]): Promise<BrowserGenerator> {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      onProgress?.({ status: "loading", label: "Loading private AI model…", percent: null });
      const transformers = await import("@huggingface/transformers");
      const generator = await transformers.pipeline(
        "text-generation",
        BROWSER_AI_MODEL,
        {
          device: "webgpu",
          dtype: "q4",
          progress_callback: (event: unknown) => {
            onProgress?.({
              status: "loading",
              label: progressLabel(event),
              percent: progressPercent(event),
            });
          },
        },
      );
      onProgress?.({ status: "ready", label: "Private AI model ready", percent: 100 });
      return generator as unknown as BrowserGenerator;
    })().catch((error) => {
      generatorPromise = null;
      throw error;
    });
  } else {
    onProgress?.({ status: "ready", label: "Private AI model cached for this session", percent: 100 });
  }
  return generatorPromise;
}

function extractGeneratedText(output: unknown): string | null {
  if (!Array.isArray(output) || !output.length) return null;
  const first = output[0] as { generated_text?: unknown };
  const generated = first?.generated_text;
  if (typeof generated === "string") return generated.trim() || null;
  if (!Array.isArray(generated) || !generated.length) return null;

  for (let index = generated.length - 1; index >= 0; index -= 1) {
    const message = generated[index] as { role?: unknown; content?: unknown };
    if (message?.role === "assistant" && typeof message.content === "string") {
      return message.content.trim() || null;
    }
  }
  const last = generated[generated.length - 1] as { content?: unknown };
  return typeof last?.content === "string" ? last.content.trim() || null : null;
}

export async function generatePrivateRevision(request: RevisionRequest): Promise<string> {
  const capability = browserAiCapability();
  if (!capability.supported) throw new Error(capability.reason ?? "Private browser AI is unavailable.");
  const text = request.text.trim();
  if (text.length < 50) throw new Error("Paste at least 50 characters before generating a revision proposal.");
  if (text.length > BROWSER_AI_MAX_CHARS) {
    throw new Error(
      `Private browser AI currently supports up to ${BROWSER_AI_MAX_CHARS.toLocaleString()} characters per pass. Split the draft or use the Ollama runtime for longer sections.`,
    );
  }

  const generator = await getGenerator(request.onProgress);
  request.onProgress?.({ status: "generating", label: "Generating privately on this device…", percent: null });

  const strengthRule = request.strength === "light"
    ? "Make only light edits and preserve sentence order wherever possible."
    : "Make measured edits for clarity and flow while preserving the author's reasoning, evidence, and overall structure.";

  const messages = [
    {
      role: "system" as const,
      content: [
        "You are Averis Private Revision AI, an academic writing assistant running on the student's device.",
        "Return one revision proposal for the student's own text and nothing else.",
        "Allowed goals: clarity, coherence, concision, academic tone, sentence flow, structure, grammar, and source-grounded paraphrasing.",
        "Never optimize for AI-detector evasion, Turnitin bypass, or a lower detector/similarity score.",
        "Preserve the student's intended meaning and original reasoning.",
        "Preserve every citation marker, quotation, number, percentage, DOI, proper noun, and factual claim unless fixing an obvious grammar-only issue.",
        "Do not invent evidence, citations, references, facts, quotations, or source claims.",
        "Do not add claims that are not already present in the student's draft.",
        "Do not explain your edits and do not add a heading such as 'Revised text'.",
        strengthRule,
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `Student goal: ${request.goal.trim()}\n\nSTUDENT TEXT\n${text}`,
    },
  ];

  const output = await generator(messages, {
    max_new_tokens: request.strength === "light" ? 850 : 1_150,
    do_sample: false,
    repetition_penalty: 1.04,
  });
  const suggestion = extractGeneratedText(output);
  if (!suggestion) throw new Error("The private AI model did not return a revision proposal. Try again or use the Ollama runtime.");
  if (suggestion.length < 20) throw new Error("The private AI response was too short to review safely. Try again or keep the original draft.");

  request.onProgress?.({ status: "ready", label: "Private AI proposal ready for sentence review", percent: 100 });
  return suggestion.slice(0, 20_000);
}
