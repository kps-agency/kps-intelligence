// Email de qualification (section 35 du prompt) : reprend le texte exact
// de la spec, avec les variables injectées. "KPS Agency" est la marque
// visible du client — distincte de APP_NAME ("KPS Intelligence"), le nom
// interne de la plateforme, qui n'apparaît jamais dans une communication
// externe.

export interface QualificationEmailParams {
  contactFirstName: string | null;
  serviceName: string;
  qualificationUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderQualificationEmail(params: QualificationEmailParams): RenderedEmail {
  const greeting = params.contactFirstName ? `Bonjour ${params.contactFirstName},` : "Bonjour,";
  const subject = `Votre demande concernant ${params.serviceName} — KPS Agency`;

  const text = `${greeting}

Merci pour votre demande concernant ${params.serviceName}.

Afin de mieux comprendre votre projet,
nous vous invitons à compléter notre formulaire
de qualification :

${params.qualificationUrl}

Cela nous permettra de vous orienter
vers la bonne équipe et de préparer
une réponse adaptée à votre besoin.

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
                  Merci pour votre demande concernant <strong>${escapeHtml(params.serviceName)}</strong>.
                </p>
                <p style="margin:0 0 24px;">
                  Afin de mieux comprendre votre projet, nous vous invitons à compléter notre
                  formulaire de qualification :
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
                <p style="margin:0 0 16px;">
                  Cela nous permettra de vous orienter vers la bonne équipe et de préparer une
                  réponse adaptée à votre besoin.
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
