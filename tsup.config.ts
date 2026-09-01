import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/public.ts", "src/control-plane.ts", "src/stdio.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  noExternal: ["yaml"],
  banner: {
    js: [
      'import { createRequire as __misterCleanCreateRequire } from "node:module";',
      "const require = __misterCleanCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
