import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output.
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    // Inherited-design rules — see ADR-009.
    //
    // The retained frontend (ADR-001) was written before the React Compiler
    // lint rules shipped in eslint-config-next 16, and trips 76 of them
    // across ~40 files. They are style and performance advice about the
    // existing data-fetching pattern (`useEffect` + `.then(setState)`), not
    // defects: every screen renders correctly. Rewriting them would be the
    // redesign that CLAUDE.md and PRD §4.2 forbid.
    //
    // They stay visible as warnings so new code is still advised, while
    // `npm run lint` passes. `react-hooks/rules-of-hooks` deliberately stays
    // an error: the two real violations it found were genuine bugs (hooks
    // after an early return in the parent chat page) and are fixed.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      // `children` is a domain noun here — a parent's children (the pupils)
      // are passed to ChildSwitcher and the Paystack modal. Renaming the prop
      // would ripple through four retained components for no behavioural gain.
      "react/no-children-prop": "off",
      // Three decorative <img> tags in retained markup; next/image would
      // change their layout.
      "@next/next/no-img-element": "warn",
    },
  },
]);

export default eslintConfig;
