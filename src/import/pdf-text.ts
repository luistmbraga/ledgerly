import { extractText, getDocumentProxy } from "unpdf";

export type PdfTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "encrypted" | "no_text" | "unreadable" };

/** Extracts the text layer locally; nothing leaves the machine. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    pages = text;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { ok: false, reason: name === "PasswordException" ? "encrypted" : "unreadable" };
  }
  const text = pages.join("\n");
  return text.replace(/\s/g, "").length < 20 ? { ok: false, reason: "no_text" } : { ok: true, text };
}
