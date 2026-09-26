module.exports = {
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  moduleFileExtensions: ["js", "json", "ts"],
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node",
};
