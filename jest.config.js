const config = {
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.(ts)$": "ts-jest",
  },
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
  testMatch: ["**/tests/*.test.ts"],
  setupFiles: ["dotenv/config"],
  testTimeout: 10000,
  moduleNameMapper: {
    uuidv7: require.resolve("uuidv7"),
  },
};
module.exports = config;
