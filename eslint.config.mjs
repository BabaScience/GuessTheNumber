// eslint-config-next 16 ships flat config directly — no FlatCompat needed.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // The original single-file prototype this app grew out of. Kept for
      // reference; it isn't part of the build.
      "higher-lower-duel.jsx",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
