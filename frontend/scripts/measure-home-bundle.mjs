import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const manifestPath =
  '.next/server/app/(authenticated)/(chat-shell)/home/[[...conversationId]]/page_client-reference-manifest.js';
const baselineMaximumGzipBytes = 350 * 1024;

if (!fs.existsSync(manifestPath)) {
  throw new Error(
    `Home client manifest is missing at ${manifestPath}; run a production build first.`
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
const homeEntry = Object.keys(manifest.entryJSFiles).find((entry) =>
  entry.endsWith('/home/[[...conversationId]]/page')
);

if (!homeEntry) {
  throw new Error('Home page entry is missing from its client manifest.');
}

const files = [...new Set(manifest.entryJSFiles[homeEntry])];
let rawBytes = 0;
let gzipBytes = 0;
let source = '';

for (const file of files) {
  const contents = fs.readFileSync(`.next/${file}`);
  rawBytes += contents.byteLength;
  gzipBytes += gzipSync(contents).byteLength;
  source += contents.toString('utf8');
}

const markers = {
  browserSupabase: ['GoTrueClient', 'SupabaseClient'].some((marker) =>
    source.includes(marker)
  ),
  conversationMap: ['ConversationMap', 'buildConversationMapModel'].some(
    (marker) => source.includes(marker)
  ),
  e2eFixtures: source.includes('getHomeE2eFixture'),
  katex: source.includes('katex'),
  syntaxHighlighting: ['highlight.js', 'hljs'].some((marker) =>
    source.includes(marker)
  ),
  threadPanel: source.includes('ThreadPanel'),
  upload: source.includes('uploadChatImageAttachments'),
};

const result = {
  entry: homeEntry,
  files: files.length,
  rawBytes,
  rawKiB: Number((rawBytes / 1024).toFixed(1)),
  gzipBytes,
  gzipKiB: Number((gzipBytes / 1024).toFixed(1)),
  baselineMaximumGzipKiB: baselineMaximumGzipBytes / 1024,
  markers,
};

console.log(JSON.stringify(result, null, 2));

if (gzipBytes > baselineMaximumGzipBytes) {
  throw new Error(
    `Home initial JavaScript is ${result.gzipKiB} KiB gzip; the baseline guard is ${result.baselineMaximumGzipKiB} KiB.`
  );
}
