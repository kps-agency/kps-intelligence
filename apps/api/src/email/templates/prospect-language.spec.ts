import { prospectLanguage } from "@kps/shared";
import { renderQualificationWhatsapp } from "../../whatsapp/templates/qualification-whatsapp";
import { renderQualificationEmail, renderQualificationReminderEmail } from "./qualification-email";
import { renderQuoteEmail } from "./quote-email";

const params = {
  contactFirstName: "Claire",
  serviceName: "Création de sites web",
  qualificationUrl: "https://app.example/qualification/abc",
};

describe("langue du prospect (section 65)", () => {
  it("déduit la langue de la demande, français par défaut", () => {
    expect(prospectLanguage("en")).toBe("en");
    expect(prospectLanguage("en-GB")).toBe("en");
    expect(prospectLanguage(" English ")).toBe("en");
    expect(prospectLanguage("fr")).toBe("fr");
    expect(prospectLanguage("de")).toBe("fr");
    expect(prospectLanguage(null)).toBe("fr");
    expect(prospectLanguage(undefined)).toBe("fr");
  });

  it("email de qualification : texte de la spec en français, équivalent en anglais", () => {
    const fr = renderQualificationEmail(params);
    expect(fr.subject).toBe("Votre demande concernant Création de sites web — KPS Agency");
    expect(fr.text).toBe(
      [
        "Bonjour Claire,",
        "Merci pour votre demande concernant Création de sites web.",
        "Afin de mieux comprendre votre projet,\nnous vous invitons à compléter notre formulaire\nde qualification :",
        "https://app.example/qualification/abc",
        "Cela nous permettra de vous orienter\nvers la bonne équipe et de préparer\nune réponse adaptée à votre besoin.",
        "L'équipe KPS Agency",
      ].join("\n\n"),
    );
    expect(fr.html).toContain('<html lang="fr">');
    expect(fr.html).toContain("Compléter le formulaire");

    const en = renderQualificationEmail({ ...params, contactFirstName: null, language: "en" });
    expect(en.subject).toBe("Your request about Création de sites web — KPS Agency");
    expect(en.text).toContain("Hello,");
    expect(en.text).toContain("Thank you for your request about Création de sites web.");
    expect(en.text).toContain("https://app.example/qualification/abc");
    expect(en.text).toContain("The KPS Agency team");
    expect(en.html).toContain('<html lang="en">');
    expect(en.html).toContain("Complete the form");
    expect(en.text).not.toMatch(/Bonjour|Merci|équipe/);
  });

  it("relance : dans les deux langues, avec la mention du lien remplacé", () => {
    const fr = renderQualificationReminderEmail(params);
    expect(fr.subject).toBe("Rappel : votre demande concernant Création de sites web — KPS Agency");
    expect(fr.text).toContain("Ce lien remplace celui de notre précédent message.");
    const en = renderQualificationReminderEmail({ ...params, language: "en" });
    expect(en.subject).toBe("Reminder: your request about Création de sites web — KPS Agency");
    expect(en.text).toContain("Hello Claire,");
    expect(en.text).toContain("This link replaces the one in our previous message.");
  });

  it("le nom du service et le prénom sont échappés dans le HTML", () => {
    const html = renderQualificationEmail({ ...params, contactFirstName: "<b>X</b>", serviceName: "A & B" }).html;
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(html).toContain("<strong>A &amp; B</strong>");
  });

  it("devis et WhatsApp suivent la langue du prospect", () => {
    const quote = { contactFirstName: "Claire", reference: "DEVIS-2026-0001", title: "Site", total: "1 200.00 CHF", validUntil: "31.01.2027", companyName: "KPS", message: null };
    expect(renderQuoteEmail(quote).subject).toBe("Devis DEVIS-2026-0001 — Site");
    const en = renderQuoteEmail({ ...quote, language: "en" });
    expect(en.subject).toBe("Quote DEVIS-2026-0001 — Site");
    expect(en.text).toContain("for a total of 1 200.00 CHF including tax. It is valid until 31.01.2027.");
    expect(renderQualificationWhatsapp(params)).toContain("Bonjour Claire 👋");
    expect(renderQualificationWhatsapp({ ...params, language: "en" })).toContain("Hello Claire 👋");
  });
});
