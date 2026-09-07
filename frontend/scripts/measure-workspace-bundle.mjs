import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const manifestPath =
  '.next/server/app/(authenticated)/(chat-shell)/workspaces/[workspaceId]/page_client-reference-manifest.js';
const maximumGzipBytes = 75 * 1024;

if (!fs.existsSync(manifestPath)) {
  throw new Error(
    `Workspace client manifest is missing at ${manifestPath}; run a production build first.`
  );
}

const context = {
  globalThis: {
    __RSC_MANIFEST: {},
  },
};
vm.runInNewContext(fs.readFileSync(manifestPath, 'utf8'), context, {
  filename: manifestPath,
});

const manifest = Object.values(context.globalThis.__RSC_MANIFEST)[0];
const workspaceEntry = Object.keys(manifest.entryJSFiles).find((entry) =>
  entry.endsWith('/workspaces/[workspaceId]/page')
);

if (!workspaceEntry) {
  throw new Error('Workspace page entry is missing from its client manifest.');
}

const files = [...new Set(manifest.entryJSFiles[workspaceEntry])];
let rawBytes = 0;
let gzipBytes = 0;
let source = '';

for (const file of files) {
  const contents = fs.readFileSync(`.next/${file}`);
  rawBytes += contents.byteLength;
  gzipBytes += gzipSync(contents).byteLength;
  source += contents.toString('utf8');
}

const includesBrowserSupabase =
  source.includes('GoTrueClient')
  || source.includes('SupabaseClient')
  || source.includes('supabase-js');
const result = {
  files: files.length,
  rawBytes,
  rawKiB: Number((rawBytes / 1024).toFixed(1)),
  gzipBytes,
  gzipKiB: Number((gzipBytes / 1024).toFixed(1)),
  maximumGzipKiB: maximumGzipBytes / 1024,
  includesBrowserSupabase,
};

console.log(JSON.stringify(result, null, 2));

if (gzipBytes > maximumGzipBytes) {
  throw new Error(
    `Workspace initial JavaScript is ${result.gzipKiB} KiB gzip; the budget is ${result.maximumGzipKiB} KiB.`
  );
}

if (includesBrowserSupabase) {
  throw new Error(
    'Workspace initial JavaScript includes the browser Supabase client.'
  );
}
