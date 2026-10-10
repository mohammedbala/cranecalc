import { defineConfig } from 'vitest/config';
// Engineering cases run whole moving-load searches; 5 s is too short when files share the CPU.
export default defineConfig({test:{include:['tests/**/*.test.ts'],testTimeout:60000}});
