import { renderTemplate } from "./render-template";

describe("renderTemplate", () => {
  it("remplace toutes les occurrences, espaces tolérés", () => {
    expect(
      renderTemplate("{{reference}} — {{ subject }} ({{reference}})", {
        reference: "KPS-2026-0001",
        subject: "Site vitrine",
      }),
    ).toBe("KPS-2026-0001 — Site vitrine (KPS-2026-0001)");
  });

  it("n'interprète pas les valeurs comme des templates", () => {
    expect(renderTemplate("{{subject}}", { subject: "{{link}}" })).toBe("{{link}}");
  });

  it("échoue sur une variable inconnue plutôt que d'envoyer un texte troué", () => {
    expect(() => renderTemplate("Bonjour {{nom}}", {})).toThrow(/nom/);
  });
});
