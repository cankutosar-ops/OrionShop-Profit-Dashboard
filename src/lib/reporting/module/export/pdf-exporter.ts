/**
 * Shared PDF exporter — management-friendly printable report (pdfmake + Roboto).
 */

import type { ReportExportDocument } from "@/lib/reporting/module/export/export-document";
import { formatExportCell } from "@/lib/reporting/module/export/format-values";

type PdfMakeModule = {
  addVirtualFileSystem: (vfs: unknown) => void;
  setFonts: (fonts: Record<string, Record<string, string>>) => void;
  createPdf: (def: unknown) => { getBuffer: () => Promise<Buffer | Uint8Array> };
};

let pdfMakeReady: PdfMakeModule | null = null;

async function getPdfMake(): Promise<PdfMakeModule> {
  if (pdfMakeReady) return pdfMakeReady;

  // Browser build + VFS works in Node and the client (Cyrillic via Roboto).
  const pdfMakeMod = await import("pdfmake/build/pdfmake.js");
  const vfsMod = await import("pdfmake/build/vfs_fonts.js");
  const pdfMake = (pdfMakeMod.default ?? pdfMakeMod) as PdfMakeModule;
  const vfs = vfsMod.default ?? vfsMod;

  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.setFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });

  pdfMakeReady = pdfMake;
  return pdfMake;
}

function metaLines(doc: ReportExportDocument): string[] {
  return [
    `Company: ${doc.meta.company}`,
    `Marketplace: ${doc.meta.marketplace}`,
    `Date range: ${doc.meta.dateFrom} → ${doc.meta.dateTo}`,
    ...doc.meta.filters.map((f) => `${f.label}: ${f.value}`),
    `Generated at: ${doc.generatedAt}`,
  ];
}

export async function exportReportPdf(
  doc: ReportExportDocument
): Promise<Uint8Array> {
  const pdfMake = await getPdfMake();

  const summaryTableBody =
    doc.summary.length > 0
      ? [
          [
            { text: "Metric", style: "tableHeader" },
            { text: "Value", style: "tableHeader" },
          ],
          ...doc.summary.map((s) => [
            s.label,
            formatExportCell(s.value, s.type, doc.currency),
          ]),
        ]
      : null;

  const dataHeader = doc.columns.map((c) => ({
    text: c.header,
    style: "tableHeader",
  }));
  const dataRows =
    doc.rows.length > 0
      ? doc.rows.map((row) =>
          doc.columns.map((col) =>
            formatExportCell(row[col.key], col.type, doc.currency)
          )
        )
      : [doc.columns.map(() => "—")];

  const definition = {
    pageSize: "A4",
    pageOrientation: doc.columns.length > 8 ? "landscape" : "portrait",
    pageMargins: [36, 48, 36, 48],
    defaultStyle: {
      font: "Roboto",
      fontSize: 9,
    },
    header: (currentPage: number, pageCount: number) => ({
      margin: [36, 16, 36, 0],
      columns: [
        { text: doc.title, fontSize: 8, color: "#6B7280" },
        {
          text: `Page ${currentPage} / ${pageCount}`,
          alignment: "right",
          fontSize: 8,
          color: "#6B7280",
        },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      margin: [36, 0, 36, 16],
      columns: [
        {
          text: `${doc.meta.company} · ${doc.meta.marketplace}`,
          fontSize: 8,
          color: "#6B7280",
        },
        {
          text: `${currentPage} / ${pageCount}`,
          alignment: "right",
          fontSize: 8,
          color: "#6B7280",
        },
      ],
    }),
    content: [
      { text: doc.title, style: "title" },
      {
        text: metaLines(doc).join("\n"),
        style: "meta",
        margin: [0, 8, 0, 12],
      },
      ...(summaryTableBody
        ? [
            { text: "Summary", style: "section", margin: [0, 0, 0, 6] },
            {
              table: {
                headerRows: 1,
                widths: ["*", "auto"],
                body: summaryTableBody,
              },
              layout: "lightHorizontalLines",
              margin: [0, 0, 0, 14],
            },
          ]
        : []),
      { text: "Report data", style: "section", margin: [0, 0, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: doc.columns.map(() => "*"),
          body: [dataHeader, ...dataRows],
        },
        layout: "lightHorizontalLines",
        fontSize: doc.columns.length > 10 ? 7 : 8,
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true, color: "#111827" },
      meta: { fontSize: 9, color: "#4B5563" },
      section: { fontSize: 11, bold: true, color: "#111827" },
      tableHeader: {
        bold: true,
        fillColor: "#1F2937",
        color: "#FFFFFF",
        fontSize: 8,
      },
    },
  };

  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}
