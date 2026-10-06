import type { ProspectLanguage } from "@kps/shared";

// Emails de qualification (sections 35 et 39 du prompt) : l'email initial
// reprend le texte exact de la spec, la relance en est la version courte.
// "KPS Agency" est la marque visible du client — distincte de APP_NAME
// ("KPS Intelligence"), le nom interne de la plateforme, qui n'apparaît
// jamais dans une communication externe.
//
// Section 65 : le prospect est servi dans sa langue (français par défaut,
// anglais si la demande est en anglais).

export interface QualificationEmailParams {
  contactFirstName: string | null;
  serviceName: string;
  qualificationUrl: string;
  language?: ProspectLanguage;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  greeting: (firstName: string | null) => string;
  subject: (serviceName: string) => string;
  // Phrase d'accroche : avant le nom du service, puis après.
  intro: [string, string];
  // Invitation à remplir le formulaire : sur plusieurs lignes dans la
  // version texte, en un paragraphe dans la version HTML.
  invitation: string[];
  button: string;
  copyLink: string;
  closing: string[];
  // Mention discrète sous le lien (relance uniquement).
  footnote?: string;
  signature: string;
}

const INITIAL: Record<ProspectLanguage, Copy> = {
  fr: {
    greeting: (firstName) => (firstName ? `Bonjour ${firstName},` : "Bonjour,"),
    subject: (serviceName) => `Votre demande concernant ${serviceName} — KPS Agency`,
    intro: ["Merci pour votre demande concernant ", "."],
    invitation: [
      "Afin de mieux comprendre votre projet,",
      "nous vous invitons à compléter notre formulaire",
      "de qualification :",
    ],
    button: "Compléter le formulaire",
    copyLink: "Ou copiez ce lien dans votre navigateur :",
    closing: [
      "Cela nous permettra de vous orienter",
      "vers la bonne équipe et de préparer",
      "une réponse adaptée à votre besoin.",
    ],
    signature: "L'équipe KPS Agency",
  },
  en: {
    greeting: (firstName) => (firstName ? `Hello ${firstName},` : "Hello,"),
    subject: (serviceName) => `Your request about ${serviceName} — KPS Agency`,
    intro: ["Thank you for your request about ", "."],
    invitation: [
      "To better understand your project,",
      "we invite you to complete our short",
      "qualification form:",
    ],
    button: "Complete the form",
    copyLink: "Or copy this link into your browser:",
    closing: [
      "This will help us direct you",
      "to the right team and prepare",
      "an answer suited to your needs.",
    ],
    signature: "The KPS Agency team",
  },
};

const REMINDER: Record<ProspectLanguage, Copy> = {
  fr: {
    greeting: INITIAL.fr.greeting,
    subject: (serviceName) => `Rappel : votre demande concernant ${serviceName} — KPS Agency`,
    intro: ["Nous revenons vers vous au sujet de votre demande concernant ", "."],
    invitation: [
      "Pour que nous puissions vous répondre de façon adaptée,",
      "il vous suffit de compléter notre formulaire (quelques minutes) :",
    ],
    button: INITIAL.fr.button,
    copyLink: INITIAL.fr.copyLink,
    closing: [],
    footnote: "Ce lien remplace celui de notre précédent message.",
    signature: INITIAL.fr.signature,
  },
  en: {
    greeting: INITIAL.en.greeting,
    subject: (serviceName) => `Reminder: your request about ${serviceName} — KPS Agency`,
    intro: ["We are following up on your request about ", "."],
    invitation: [
      "So that we can give you a suitable answer,",
      "all you need to do is complete our form (a few minutes):",
    ],
    button: INITIAL.en.button,
    copyLink: INITIAL.en.copyLink,
    closing: [],
    footnote: "This link replaces the one in our previous message.",
    signature: INITIAL.en.signature,
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(copy: Copy, params: QualificationEmailParams, language: ProspectLanguage): RenderedEmail {
  const greeting = copy.greeting(params.contactFirstName);
  const url = params.qualificationUrl;

  const text = [
    greeting,
    `${copy.intro[0]}${params.serviceName}${copy.intro[1]}`,
    copy.invitation.join("\n"),
    url,
    copy.closing.length > 0 ? copy.closing.join("\n") : null,
    copy.footnote ?? null,
    copy.signature,
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");

  const paragraph = (content: string, style = "margin:0 0 16px;") => `<p style="${style}">${content}</p>`;
  const small = "margin:0 0 16px;color:#52525b;font-size:13px;";

  const html = `<!doctype html>
<html lang="${language}">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px;color:#18181b;font-size:15px;line-height:1.6;">
                ${paragraph("KPS Agency", "margin:0 0 16px;font-weight:bold;font-size:18px;")}
                ${paragraph(escapeHtml(greeting))}
                ${paragraph(`${escapeHtml(copy.intro[0])}<strong>${escapeHtml(params.serviceName)}</strong>${escapeHtml(copy.intro[1])}`)}
                ${paragraph(escapeHtml(copy.invitation.join(" ")), "margin:0 0 24px;")}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:6px;background-color:#18181b;">
                      <a href="${url}"
                         style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:bold;">
                        ${escapeHtml(copy.button)}
                      </a>
                    </td>
                  </tr>
                </table>
                ${paragraph(`${escapeHtml(copy.copyLink)}<br /><a href="${url}" style="color:#52525b;word-break:break-all;">${url}</a>`, small)}
                ${copy.closing.length > 0 ? paragraph(escapeHtml(copy.closing.join(" "))) : ""}
                ${copy.footnote ? paragraph(escapeHtml(copy.footnote), small) : ""}
                ${paragraph(escapeHtml(copy.signature), "margin:24px 0 0;")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject(params.serviceName), text, html };
}

export function renderQualificationEmail(params: QualificationEmailParams): RenderedEmail {
  const language = params.language ?? "fr";
  return render(INITIAL[language], params, language);
}

export function renderQualificationReminderEmail(params: QualificationEmailParams): RenderedEmail {
  const language = params.language ?? "fr";
  return render(REMINDER[language], params, language);
}
