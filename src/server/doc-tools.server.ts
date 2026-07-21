/**
 * Document tools: PDF extract, DOCX read/write, XLSX read/write.
 * Toutes les libs utilisées sont pure-JS et compatibles Worker/Edge.
 *
 * Inputs côté agent : `source` peut être
 *  - une URL http(s)
 *  - un dataURL "data:application/...;base64,..."
 *  - un base64 brut
 *
 * Output (write) : retourne un dataURL téléchargeable + suggestion d'écriture VFS.
 */
import type { ToolName, ToolResult, VFile, FsMutation } from "./agent-tools.server";

type RawArgs = Record<string, unknown>;

async function fetchToBytes(source: string): Promise<Uint8Array> {
  if (source.startsWith("data:")) {
    const b64 = source.split(",")[1] ?? "";
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }
  if (/^https?:\/\//i.test(source)) {
    const r = await fetch(source);
    if (!r.ok) throw new Error(`fetch ${source} → ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  // assume raw base64
  return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

function ok(output: string): ToolResult {
  return { ok: true, output };
}
function err(msg: string): ToolResult {
  return { ok: false, output: msg };
}

export const DOC_TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "pdf_extract",
      description: "Extrait le texte (et meta) d'un PDF. Source = URL, dataURL ou base64.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", description: "URL https, dataURL ou base64." },
          max_pages: { type: "integer", description: "Limite pages (défaut 50)." },
        },
        required: ["source"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "docx_read",
      description: "Lit un fichier .docx et retourne le texte / HTML.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          format: { type: "string", enum: ["text", "html"], description: "défaut text" },
        },
        required: ["source"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "docx_write",
      description: "Génère un fichier .docx à partir d'un titre + paragraphes. Retourne dataURL.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          paragraphs: { type: "array", items: { type: "string" } },
          target_path: { type: "string", description: "Si fourni, écrit le base64 dans le VFS." },
        },
        required: ["paragraphs"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "xlsx_read",
      description: "Lit un classeur .xlsx → JSON {sheet: rows[]}.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          sheet: { type: "string", description: "Nom de feuille spécifique (sinon toutes)." },
        },
        required: ["source"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "xlsx_write",
      description: "Crée un classeur .xlsx à partir de données JSON. Retourne dataURL.",
      parameters: {
        type: "object",
        properties: {
          sheets: {
            type: "object",
            description: "Map { sheetName: array of row objects }.",
          },
          target_path: { type: "string" },
        },
        required: ["sheets"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "pdf_generate",
      description:
        "Génère un PDF stylé (cover + sections) via pdf-lib. Couleurs/fonts personnalisables. Retourne dataURL + écrit dans le VFS si target_path. Idéal rapports, factures, exports clients.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          sections: {
            type: "array",
            description: "Sections [{ heading, body }]. body = texte multiligne.",
            items: {
              type: "object",
              properties: {
                heading: { type: "string" },
                body: { type: "string" },
              },
            },
          },
          accent_color: { type: "string", description: "Hex #RRGGBB (défaut #3B82F6)." },
          footer: { type: "string" },
          target_path: { type: "string" },
        },
        required: ["title", "sections"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "artifact_export",
      description:
        "Empaquette plusieurs fichiers (texte ou base64) dans un .zip téléchargeable. Inputs : files = [{ path, content, encoding? }]. encoding 'base64' pour binaires (PDF/MP4/images). Retourne dataURL zip + écrit dans VFS si target_path.",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" },
                encoding: { type: "string", enum: ["utf8", "base64"] },
              },
              required: ["path", "content"],
            },
          },
          target_path: { type: "string" },
        },
        required: ["files"],
      },
    },
  },
];

export async function executeDocTool(
  name: ToolName | string,
  args: RawArgs,
  _vfs: Map<string, string>,
  mutations: FsMutation[],
): Promise<ToolResult | null> {
  try {
    if (name === "pdf_extract") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const bytes = await fetchToBytes(String(args.source));
      const pdf = await getDocumentProxy(bytes);
      const max = Math.min(Number(args.max_pages) || 50, pdf.numPages);
      const { text } = await extractText(pdf, { mergePages: true });
      const trimmed = String(text).slice(0, 50_000);
      return ok(
        JSON.stringify({
          pages: pdf.numPages,
          extracted_pages: max,
          chars: trimmed.length,
          text: trimmed,
        }),
      );
    }

    if (name === "docx_read") {
      const mammoth = await import("mammoth");
      const bytes = await fetchToBytes(String(args.source));
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const fmt = (args.format as string) || "text";
      const result =
        fmt === "html"
          ? await mammoth.convertToHtml({ arrayBuffer: buf as ArrayBuffer })
          : await mammoth.extractRawText({ arrayBuffer: buf as ArrayBuffer });
      return ok(
        JSON.stringify({
          format: fmt,
          content: String(result.value).slice(0, 60_000),
          messages: result.messages?.slice(0, 5) ?? [],
        }),
      );
    }

    if (name === "docx_write") {
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
      const paras = (args.paragraphs as string[]) ?? [];
      const children: any[] = [];
      if (args.title) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: String(args.title), bold: true })],
          }),
        );
      }
      for (const p of paras) {
        children.push(new Paragraph({ children: [new TextRun(String(p))] }));
      }
      const doc = new Document({ sections: [{ children }] });
      const buf = await Packer.toBuffer(doc);
      const bytes = new Uint8Array(buf);
      const dataUrl = bytesToDataUrl(
        bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      if (args.target_path) {
        mutations.push({ op: "write", path: String(args.target_path), content: dataUrl });
      }
      return ok(
        JSON.stringify({
          bytes: bytes.length,
          target_path: args.target_path ?? null,
          dataUrl: dataUrl.slice(0, 120) + "…",
        }),
      );
    }

    if (name === "xlsx_read") {
      const XLSX = await import("xlsx");
      const bytes = await fetchToBytes(String(args.source));
      const wb = XLSX.read(bytes, { type: "array" });
      const result: Record<string, unknown[]> = {};
      const targets = args.sheet ? [String(args.sheet)] : wb.SheetNames;
      for (const s of targets) {
        const ws = wb.Sheets[s];
        if (!ws) continue;
        result[s] = XLSX.utils.sheet_to_json(ws);
      }
      return ok(JSON.stringify({ sheets: Object.keys(result), data: result }).slice(0, 80_000));
    }

    if (name === "xlsx_write") {
      const XLSX = await import("xlsx");
      const sheets = (args.sheets as Record<string, any[]>) ?? {};
      const wb = XLSX.utils.book_new();
      for (const [name, rows] of Object.entries(sheets)) {
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      }
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const bytes = new Uint8Array(buf);
      const dataUrl = bytesToDataUrl(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      if (args.target_path) {
        mutations.push({ op: "write", path: String(args.target_path), content: dataUrl });
      }
      return ok(
        JSON.stringify({
          bytes: bytes.length,
          sheets: Object.keys(sheets),
          target_path: args.target_path ?? null,
          dataUrl: dataUrl.slice(0, 120) + "…",
        }),
      );
    }

    if (name === "pdf_generate") {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const title = String(args.title ?? "Document");
      const subtitle = args.subtitle ? String(args.subtitle) : "";
      const sections = (args.sections as Array<{ heading?: string; body?: string }>) ?? [];
      const footer = args.footer ? String(args.footer) : "";
      const accent = String(args.accent_color ?? "#3B82F6");
      const hex = accent.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;

      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const PAGE_W = 595;
      const PAGE_H = 842;
      const MARGIN = 50;

      const wrap = (text: string, maxW: number, size: number, f: typeof font): string[] => {
        const lines: string[] = [];
        for (const para of text.split("\n")) {
          const words = para.split(/\s+/);
          let cur = "";
          for (const w of words) {
            const test = cur ? `${cur} ${w}` : w;
            if (f.widthOfTextAtSize(test, size) > maxW) {
              if (cur) lines.push(cur);
              cur = w;
            } else cur = test;
          }
          if (cur) lines.push(cur);
        }
        return lines;
      };

      let page = pdf.addPage([PAGE_W, PAGE_H]);
      // Cover accent bar
      page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: rgb(r, g, b) });
      page.drawText(title, { x: MARGIN, y: PAGE_H - 50, size: 22, font: fontBold, color: rgb(1, 1, 1) });
      if (subtitle) {
        page.drawText(subtitle, { x: MARGIN, y: PAGE_H - 72, size: 11, font, color: rgb(1, 1, 1) });
      }

      let y = PAGE_H - 120;
      const newPageIfNeeded = (needed: number) => {
        if (y - needed < MARGIN + 30) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN;
        }
      };

      for (const sec of sections) {
        if (sec.heading) {
          newPageIfNeeded(30);
          page.drawText(String(sec.heading), {
            x: MARGIN, y, size: 14, font: fontBold, color: rgb(r, g, b),
          });
          y -= 6;
          page.drawLine({
            start: { x: MARGIN, y: y - 2 }, end: { x: PAGE_W - MARGIN, y: y - 2 },
            thickness: 0.5, color: rgb(r, g, b),
          });
          y -= 18;
        }
        const body = String(sec.body ?? "");
        const lines = wrap(body, PAGE_W - MARGIN * 2, 11, font);
        for (const ln of lines) {
          newPageIfNeeded(16);
          page.drawText(ln, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
          y -= 15;
        }
        y -= 12;
      }

      if (footer) {
        const pages = pdf.getPages();
        for (let i = 0; i < pages.length; i++) {
          pages[i].drawText(`${footer} · ${i + 1}/${pages.length}`, {
            x: MARGIN, y: 25, size: 9, font, color: rgb(0.5, 0.5, 0.5),
          });
        }
      }

      const bytes = await pdf.save();
      const dataUrl = bytesToDataUrl(bytes, "application/pdf");
      if (args.target_path) {
        mutations.push({ op: "write", path: String(args.target_path), content: dataUrl });
      }
      return ok(JSON.stringify({
        bytes: bytes.length,
        pages: pdf.getPageCount(),
        target_path: args.target_path ?? null,
        dataUrl: dataUrl.slice(0, 120) + "…",
      }));
    }

    if (name === "artifact_export") {
      const JSZip = (await import("jszip")).default;
      const files = (args.files as Array<{ path: string; content: string; encoding?: string }>) ?? [];
      if (files.length === 0) return err("artifact_export: 'files' vide");
      const zip = new JSZip();
      for (const f of files) {
        const path = String(f.path).replace(/^\/+/, "");
        if (f.encoding === "base64") {
          const raw = f.content.includes(",") ? f.content.split(",")[1] : f.content;
          zip.file(path, raw, { base64: true });
        } else {
          zip.file(path, String(f.content));
        }
      }
      const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      const dataUrl = bytesToDataUrl(buf, "application/zip");
      if (args.target_path) {
        mutations.push({ op: "write", path: String(args.target_path), content: dataUrl });
      }
      return ok(JSON.stringify({
        bytes: buf.length,
        files: files.length,
        target_path: args.target_path ?? null,
        dataUrl: dataUrl.slice(0, 120) + "…",
      }));
    }

    return null;
  } catch (e: any) {
    return err(`${name} failed: ${e?.message ?? String(e)}`);
  }
}
