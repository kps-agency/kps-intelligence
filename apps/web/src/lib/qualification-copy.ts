// Textes de la page publique de qualification, dans la langue du prospect
// (section 65). Les libellés des questions viennent du formulaire tel
// qu'il a été rédigé dans le form builder : ils ne sont pas traduits ici.

export type QualificationLocale = "fr" | "en";

export interface QualificationCopy {
  loading: string;
  notFound: string;
  genericError: string;
  cancelledTitle: string;
  cancelledBody: (brand: string) => string;
  expiredTitle: string;
  expiredBody: (brand: string) => string;
  completedTitle: string;
  completedLines: string[];
  reference: string;
  greeting: (firstName: string | null) => string;
  thanks: string;
  thanksAbout: string;
  intro: string;
  step: (current: number, total: number) => string;
  progress: string;
  previous: string;
  next: string;
  submit: string;
  submitting: string;
  saving: string;
  missing: (labels: string[]) => string;
  saveFailed: string;
  submitFailed: string;
  consentLabel: string;
  consentDetail: (brand: string) => string;
  consentRequired: string;
  languageSwitch: string;
}

export const QUALIFICATION_COPY: Record<QualificationLocale, QualificationCopy> = {
  fr: {
    loading: "Chargement",
    notFound: "Ce lien de qualification est introuvable.",
    genericError: "Une erreur est survenue. Merci de réessayer dans quelques instants.",
    cancelledTitle: "Lien désactivé",
    cancelledBody: (brand) => `Ce lien de qualification n'est plus valide. Contactez ${brand} pour en obtenir un nouveau.`,
    expiredTitle: "Lien expiré",
    expiredBody: (brand) => `Ce lien de qualification a expiré. Contactez ${brand} pour en obtenir un nouveau.`,
    completedTitle: "Merci pour votre demande",
    completedLines: [
      "Nous avons bien reçu les informations concernant votre projet.",
      "Notre équipe va maintenant analyser votre besoin et reviendra vers vous.",
    ],
    reference: "Référence",
    greeting: (firstName) => (firstName ? `Bonjour ${firstName},` : "Bonjour,"),
    thanks: "Merci pour votre demande.",
    thanksAbout: "Merci pour votre demande concernant",
    intro: "Quelques informations nous permettront de mieux comprendre votre besoin.",
    step: (current, total) => `Étape ${current} / ${total}`,
    progress: "Progression de la qualification",
    previous: "Précédent",
    next: "Suivant",
    submit: "Soumettre",
    submitting: "Envoi...",
    saving: "Enregistrement...",
    missing: (labels) => `Champs requis manquants : ${labels.join(", ")}`,
    saveFailed: "Échec de l'enregistrement.",
    submitFailed: "Échec de la soumission.",
    consentLabel: "J'accepte que mes réponses soient utilisées pour étudier ma demande et me recontacter.",
    consentDetail: (brand) =>
      `${brand} n'utilise ces informations que pour répondre à votre demande et ne les transmet à aucun tiers. Vous pouvez à tout moment en demander une copie ou la suppression.`,
    consentRequired: "Votre accord est nécessaire pour envoyer le formulaire.",
    languageSwitch: "English",
  },
  en: {
    loading: "Loading",
    notFound: "This qualification link could not be found.",
    genericError: "Something went wrong. Please try again in a moment.",
    cancelledTitle: "Link disabled",
    cancelledBody: (brand) => `This qualification link is no longer valid. Please contact ${brand} to get a new one.`,
    expiredTitle: "Link expired",
    expiredBody: (brand) => `This qualification link has expired. Please contact ${brand} to get a new one.`,
    completedTitle: "Thank you for your request",
    completedLines: [
      "We have received the information about your project.",
      "Our team will now review your needs and get back to you.",
    ],
    reference: "Reference",
    greeting: (firstName) => (firstName ? `Hello ${firstName},` : "Hello,"),
    thanks: "Thank you for your request.",
    thanksAbout: "Thank you for your request about",
    intro: "A few details will help us better understand your needs.",
    step: (current, total) => `Step ${current} of ${total}`,
    progress: "Qualification progress",
    previous: "Back",
    next: "Next",
    submit: "Submit",
    submitting: "Sending...",
    saving: "Saving...",
    missing: (labels) => `Required fields missing: ${labels.join(", ")}`,
    saveFailed: "Could not save your answer.",
    submitFailed: "Could not send the form.",
    consentLabel: "I agree that my answers may be used to review my request and to contact me.",
    consentDetail: (brand) =>
      `${brand} only uses this information to answer your request and does not share it with any third party. You can ask for a copy or for its deletion at any time.`,
    consentRequired: "Your agreement is required to send the form.",
    languageSwitch: "Français",
  },
};
