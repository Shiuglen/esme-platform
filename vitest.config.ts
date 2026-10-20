import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "modulos/**/test/**/*.test.ts"],
    // los dist de los módulos se construyen antes de correr (tests/setup/)
    globalSetup: ["tests/setup/build-modulos.ts"],
  },
});
