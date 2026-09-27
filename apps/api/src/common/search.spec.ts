import { toContainsPattern, toWordPatterns } from "./search";

describe("toContainsPattern", () => {
  it("entoure le terme du joker « contient »", () => {
    expect(toContainsPattern("acme")).toBe("*acme*");
  });

  it("neutralise les caractères qui changeraient la syntaxe du filtre PostgREST", () => {
    // Tentative d'injection d'une condition supplémentaire.
    const pattern = toContainsPattern('x,status.eq.CHURNED)"\\');
    expect(pattern).not.toMatch(/[,()"\\]/);
    expect(pattern).toBe("*x status.eq.CHURNED*");
  });

  it("retire les jokers fournis par l'utilisateur", () => {
    expect(toContainsPattern("a*b%c")).toBe("*a b c*");
  });

  it("renvoie null quand il ne reste rien à chercher", () => {
    expect(toContainsPattern("   ")).toBeNull();
    expect(toContainsPattern(',()"')).toBeNull();
  });
});

describe("toWordPatterns", () => {
  it("un seul mot donne un seul motif", () => {
    expect(toWordPatterns("Bob")).toEqual(["*Bob*"]);
  });

  it("un nom complet donne un motif par mot (recherche prénom+nom sur deux colonnes)", () => {
    expect(toWordPatterns("Bob Durand")).toEqual(["*Bob*", "*Durand*"]);
  });

  it("ignore les espaces multiples et les extrémités", () => {
    expect(toWordPatterns("  Bob   Durand  ")).toEqual(["*Bob*", "*Durand*"]);
  });

  it("renvoie un tableau vide pour une chaîne sans contenu", () => {
    expect(toWordPatterns("   ")).toEqual([]);
  });
});
