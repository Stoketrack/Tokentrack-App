// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";


export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    preset: "cloudflare-module",
    output: {
      dir: "dist",
      serverDir: "dist/server",
      publicDir: "dist/client",
    },
  },
  // Outside Lovable's own hosted sandbox (e.g. Replit, or any other host),
  // this package still defaults the dev server to host "::" (IPv6-only).
  // That fails outright in environments without IPv6 support — confirmed
  // by reproducing the exact crash (`EAFNOSUPPORT: address family not
  // supported :::8080`) locally. `host: true` binds 0.0.0.0 instead, which
  // works everywhere. Port stays 8080 to match this package's convention.
  vite: { plugins: [], server: { host: true, port: 8080 } },
});
