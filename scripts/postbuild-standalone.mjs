/**
 * Completes the standalone build.
 *
 * `next build` writes .next/standalone/server.js with a trimmed node_modules,
 * but deliberately does NOT copy the static assets into it — Next assumes a CDN
 * serves them. On a managed Node host there is no CDN in front, so without this
 * step the site boots and renders every page completely unstyled, with no
 * client JavaScript and no images. It looks like a broken deploy; it is a
 * missing copy.
 *
 * Run after `next build` when deploying to a host that runs the entry file
 * directly (Hostinger's Node.js app, Railway, Render, a plain systemd unit).
 */

import { cp, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standalone))) {
  console.error(
    'No .next/standalone directory. Set output: "standalone" in next.config.ts and build first.',
  );
  process.exit(1);
}

const copies = [
  { from: path.join(root, ".next", "static"), to: path.join(standalone, ".next", "static") },
  { from: path.join(root, "public"), to: path.join(standalone, "public") },
];

for (const { from, to } of copies) {
  if (!(await exists(from))) {
    console.log(`  skipped ${path.relative(root, from)} (not present)`);
    continue;
  }
  await cp(from, to, { recursive: true });
  console.log(`  copied  ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

console.log("\nStandalone build complete. Entry file: .next/standalone/server.js\n");
