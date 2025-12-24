import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  // Game simulation loops intentionally mutate objects held in refs for perf.
  // React Compiler/immutability lint rules are not a good fit for these modules.
  {
    files: [
      "src/components/game/aircraftSystems.ts",
      "src/components/game/bargeSystem.ts",
      "src/components/game/boatSystem.ts",
      "src/components/game/effectsSystems.ts",
      "src/components/game/seaplaneSystem.ts",
      "src/components/game/vehicleSystems.ts",
    ],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];

export default config;
