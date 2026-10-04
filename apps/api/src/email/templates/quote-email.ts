import type { RenderedEmail } from "./qualification-email";

// Email d'envoi d'un devis (section 51) : le PDF est en pièce jointe. Le
// nom de l'expéditeur est la raison sociale saisie dans Paramètres.
export interface QuoteEmailParams {
  contactFirstName: string | null;
  reference: string;
  title: string;
  total: string;
  validUntil: string | null;
  companyName: string;
  // Message libre du commercial, ajouté au texte standard.
  message: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderQuoteEmail(params: QuoteEmailParams): RenderedEmail {
  const greeting = params.contactFirstName ? `Bonjour ${params.contactFirstName},` : "Bonjour,";
  const subject = `Devis ${params.reference} — ${params.title}`;
  const validity = params.validUntil ? ` Il est valable jusqu'au ${params.validUntil}.` : "";
  const intro = `Veuillez trouver en pièce jointe notre devis ${params.reference} pour « ${params.title} », d'un montant de ${params.total} TTC.${validity}`;
  const closing = "Nous restons à votre disposition pour toute question.";

  const text = [greeting, intro, params.message, closing, params.companyName]
    .filter((part): part is string => !!part)
    .join("\n\n");

  const paragraphs = [greeting, intro, params.message, closing]
    .filter((part): part is string => !!part)
    .map(
      (part) =>
        `<p style="margin:0 0 16px;">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n                ");

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px;color:#18181b;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;font-weight:bold;font-size:18px;">${escapeHtml(params.companyName)}</p>
                ${paragraphs}
                <p style="margin:0;">${escapeHtml(params.companyName)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
