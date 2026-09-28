import type { QualificationEmailParams, RenderedEmail } from "./qualification-email";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Relance du formulaire de qualification (section 39) : même ton et même
// mise en page que l'email initial (section 35), plus court. Le lien est
// neuf (voir QualificationSessionsService.resendLink).
export function renderQualificationReminderEmail(params: QualificationEmailParams): RenderedEmail {
  const greeting = params.contactFirstName ? `Bonjour ${params.contactFirstName},` : "Bonjour,";
  const subject = `Rappel : votre demande concernant ${params.serviceName} — KPS Agency`;

  const text = `${greeting}

Nous revenons vers vous au sujet de votre demande concernant ${params.serviceName}.

Pour que nous puissions vous répondre de façon adaptée,
il vous suffit de compléter notre formulaire (quelques minutes) :

${params.qualificationUrl}

Ce lien remplace celui de notre précédent message.

L'équipe KPS Agency`;

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px;color:#18181b;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;font-weight:bold;font-size:18px;">KPS Agency</p>
                <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 16px;">
                  Nous revenons vers vous au sujet de votre demande concernant
                  <strong>${escapeHtml(params.serviceName)}</strong>.
                </p>
                <p style="margin:0 0 24px;">
                  Pour que nous puissions vous répondre de façon adaptée, il vous suffit de
                  compléter notre formulaire (quelques minutes) :
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:6px;background-color:#18181b;">
                      <a href="${params.qualificationUrl}"
                         style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:bold;">
                        Compléter le formulaire
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;color:#52525b;font-size:13px;">
                  Ou copiez ce lien dans votre navigateur :<br />
                  <a href="${params.qualificationUrl}" style="color:#52525b;word-break:break-all;">${params.qualificationUrl}</a>
                </p>
                <p style="margin:0 0 16px;color:#52525b;font-size:13px;">
                  Ce lien remplace celui de notre précédent message.
                </p>
                <p style="margin:24px 0 0;">L'équipe KPS Agency</p>
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
