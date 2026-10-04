import PDFDocument from "pdfkit";
import { formatAmount, formatDate, formatPercent, type QuoteDocument } from "./quote-document";

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BOTTOM = PAGE_HEIGHT - 70;
const MUTED = "#52525b";
const RULE = "#d4d4d8";

// Colonnes du tableau des lignes (x, largeur).
const COLUMNS = {
  description: { x: MARGIN, width: 235 },
  quantity: { x: MARGIN + 240, width: 50 },
  unitPrice: { x: MARGIN + 295, width: 75 },
  discount: { x: MARGIN + 375, width: 45 },
  total: { x: MARGIN + 425, width: CONTENT_WIDTH - 425 },
};

function joined(parts: (string | null)[], separator: string): string {
  return parts.filter((part): part is string => !!part && part.trim() !== "").join(separator);
}

// Génère le PDF d'un devis (section 51) à partir de son contenu figé.
// Texte réel (sélectionnable, lisible par un lecteur d'écran), A4.
export function renderQuotePdf(document: QuoteDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      info: {
        Title: `Devis ${document.reference}`,
        Author: document.company.legalName,
        Subject: document.title,
      },
      lang: "fr-CH",
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const { company, client } = document;

    // Émetteur.
    pdf.font("Helvetica-Bold").fontSize(16).fillColor("black").text(company.legalName, MARGIN, MARGIN);
    pdf.font("Helvetica").fontSize(9).fillColor(MUTED);
    for (const line of [
      company.address,
      joined([company.postalCode, company.city], " "),
      company.country,
      joined([company.email, company.phone], "  ·  "),
      company.website,
      company.vatNumber ? `N° TVA : ${company.vatNumber}` : null,
    ]) {
      if (line) pdf.text(line);
    }

    // Titre et références.
    pdf.moveDown(2);
    pdf.font("Helvetica-Bold").fontSize(20).fillColor("black").text("Devis");
    pdf.font("Helvetica").fontSize(10);
    const metaTop = pdf.y + 6;
    pdf.text(`Référence : ${document.reference}`, MARGIN, metaTop);
    pdf.text(`Version : ${document.version}`);
    pdf.text(`Date : ${formatDate(document.issuedOn)}`);
    if (document.validUntil) pdf.text(`Valable jusqu'au : ${formatDate(document.validUntil)}`);
    const metaBottom = pdf.y;

    // Destinataire, à droite des références.
    const clientX = MARGIN + 290;
    pdf.font("Helvetica").fontSize(9).fillColor(MUTED).text("Destinataire", clientX, metaTop);
    pdf.font("Helvetica-Bold").fontSize(11).fillColor("black").text(client.companyName, clientX, pdf.y + 2, {
      width: CONTENT_WIDTH - 290,
    });
    pdf.font("Helvetica").fontSize(10);
    if (client.contactName) pdf.text(client.contactName, { width: CONTENT_WIDTH - 290 });
    const place = joined([client.city, client.country], ", ");
    if (place) pdf.text(place, { width: CONTENT_WIDTH - 290 });

    pdf.y = Math.max(metaBottom, pdf.y) + 18;
    pdf.font("Helvetica-Bold").fontSize(12).text(document.title, MARGIN, pdf.y, { width: CONTENT_WIDTH });
    pdf.moveDown(0.8);

    // Tableau des lignes.
    const header = () => {
      const y = pdf.y;
      pdf.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
      pdf.text("Désignation", COLUMNS.description.x, y, { width: COLUMNS.description.width });
      pdf.text("Qté", COLUMNS.quantity.x, y, { width: COLUMNS.quantity.width, align: "right" });
      pdf.text("Prix unitaire", COLUMNS.unitPrice.x, y, { width: COLUMNS.unitPrice.width, align: "right" });
      pdf.text("Remise", COLUMNS.discount.x, y, { width: COLUMNS.discount.width, align: "right" });
      pdf.text(`Montant ${document.currency}`, COLUMNS.total.x, y, { width: COLUMNS.total.width, align: "right" });
      const ruleY = y + 14;
      pdf.moveTo(MARGIN, ruleY).lineTo(PAGE_WIDTH - MARGIN, ruleY).strokeColor(RULE).lineWidth(1).stroke();
      pdf.y = ruleY + 6;
      pdf.font("Helvetica").fontSize(10).fillColor("black");
    };
    header();

    for (const item of document.items) {
      const height = pdf.heightOfString(item.description, { width: COLUMNS.description.width });
      if (pdf.y + height > BOTTOM) {
        pdf.addPage();
        header();
      }
      const y = pdf.y;
      pdf.text(item.description, COLUMNS.description.x, y, { width: COLUMNS.description.width });
      pdf.text(formatAmount(item.quantity).replace(/\.00$/, ""), COLUMNS.quantity.x, y, {
        width: COLUMNS.quantity.width,
        align: "right",
      });
      pdf.text(formatAmount(item.unitPrice), COLUMNS.unitPrice.x, y, { width: COLUMNS.unitPrice.width, align: "right" });
      pdf.text(item.discountPercent > 0 ? formatPercent(item.discountPercent) : "", COLUMNS.discount.x, y, {
        width: COLUMNS.discount.width,
        align: "right",
      });
      pdf.text(formatAmount(item.total), COLUMNS.total.x, y, { width: COLUMNS.total.width, align: "right" });
      const ruleY = y + height + 5;
      pdf.moveTo(MARGIN, ruleY).lineTo(PAGE_WIDTH - MARGIN, ruleY).strokeColor(RULE).lineWidth(0.5).stroke();
      pdf.y = ruleY + 6;
    }

    // Totaux.
    if (pdf.y + 90 > BOTTOM) pdf.addPage();
    pdf.moveDown(0.5);
    const labelX = MARGIN + 270;
    const labelWidth = 150;
    const totalRow = (label: string, amount: number, bold = false) => {
      const y = pdf.y;
      pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10);
      pdf.text(label, labelX, y, { width: labelWidth });
      pdf.text(`${formatAmount(amount)} ${document.currency}`, COLUMNS.total.x - 20, y, {
        width: COLUMNS.total.width + 20,
        align: "right",
      });
      pdf.y = y + (bold ? 18 : 15);
    };
    totalRow("Sous-total HT", document.subtotal);
    if (document.discount > 0) {
      totalRow(`Remise ${formatPercent(document.discountPercent)}`, -document.discount);
      totalRow("Total HT", document.subtotal - document.discount);
    }
    totalRow(`TVA ${formatPercent(document.taxRate)}`, document.taxAmount);
    pdf
      .moveTo(labelX, pdf.y)
      .lineTo(PAGE_WIDTH - MARGIN, pdf.y)
      .strokeColor("black")
      .lineWidth(1)
      .stroke();
    pdf.y += 6;
    totalRow("Total TTC", document.total, true);

    // Notes du devis, puis conditions générales de l'émetteur.
    const paragraph = (title: string, body: string) => {
      if (pdf.y + 50 > BOTTOM) pdf.addPage();
      pdf.moveDown(1);
      pdf.font("Helvetica-Bold").fontSize(10).fillColor("black").text(title, MARGIN, pdf.y, { width: CONTENT_WIDTH });
      pdf.font("Helvetica").fontSize(9).fillColor(MUTED).text(body, { width: CONTENT_WIDTH });
    };
    if (document.notes) paragraph("Remarques", document.notes);
    if (company.quoteTerms) paragraph("Conditions", company.quoteTerms);
    if (company.iban) paragraph("Coordonnées bancaires", `IBAN : ${company.iban}`);

    pdf.end();
  });
}
