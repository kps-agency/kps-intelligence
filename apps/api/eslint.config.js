const base = require("@kps/config/eslint-base.js");

module.exports = [
  ...base,
  {
    // NestJS repose sur `emitDecoratorMetadata` pour l'injection de
    // dépendances (constructeurs) et sur la ValidationPipe (class-
    // validator) pour les DTO `@Body()`. Dans les deux cas, un
    // `import type` efface la classe à l'exécution : `design:paramtypes`
    // ne contient plus la vraie référence (elle devient `Object`), ce qui
    // casse silencieusement la résolution de providers ET désactive la
    // validation des DTO. Cette règle n'a aucune notion de ces usages par
    // réflexion — on la désactive pour ce package.
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
