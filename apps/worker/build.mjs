import { build } from "esbuild";

// Bundle the worker and the workspace TypeScript packages into one file; leave
// third-party packages (Prisma runtime, pg, Anthropic SDK…) in node_modules.
await build({
  entryPoints: ["src/index.ts", "src/run-job.ts", "src/run-window.ts", "src/maintenance.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  logLevel: "info",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  plugins: [
    {
      name: "externalize-node-modules",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@tdc/")) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
