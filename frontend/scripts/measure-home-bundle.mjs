import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const manifestPath =
  '.next/server/app/(authenticated)/(chat-shell)/home/[[...conversationId]]/page_client-reference-manifest.js';
const maximumGzipBytes = 100 * 1024;

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
const clientChunkFiles = fs
  .readdirSync('.next/static/chunks', { recursive: true })
  .filter((file) => file.endsWith('.js'))
  .map((file) => `.next/static/chunks/${file}`);
let rawBytes = 0;
let gzipBytes = 0;
let source = '';

for (const file of files) {
  const contents = fs.readFileSync(`.next/${file}`);
  rawBytes += contents.byteLength;
  gzipBytes += gzipSync(contents).byteLength;
  source += contents.toString('utf8');
}

const fixtureMarker =
  'microtasks run before the browser paints the next frame';
const productionFixtureChunk = clientChunkFiles.find((file) =>
  fs.readFileSync(file, 'utf8').includes(fixtureMarker)
);
const markers = {
  browserSupabase: ['GoTrueClient', 'SupabaseClient'].some((marker) =>
    source.includes(marker)
  ),
  conversationMap: source.includes('conversation-map-model-build'),
  e2eFixtures: Boolean(productionFixtureChunk),
  katex: source.includes('katex'),
  syntaxHighlighting: ['highlight.js', 'hljs'].some((marker) =>
    source.includes(marker)
  ),
  threadPanel: source.includes('Resize thread panel'),
  upload: source.includes('You must be signed in to attach images.'),
};

const result = {
  entry: homeEntry,
  files: files.length,
  rawBytes,
  rawKiB: Number((rawBytes / 1024).toFixed(1)),
  gzipBytes,
  gzipKiB: Number((gzipBytes / 1024).toFixed(1)),
  maximumGzipKiB: maximumGzipBytes / 1024,
  clientChunkFilesScanned: clientChunkFiles.length,
  markers,
};

console.log(JSON.stringify(result, null, 2));

if (gzipBytes > maximumGzipBytes) {
  throw new Error(
    `Home initial JavaScript is ${result.gzipKiB} KiB gzip; the budget is ${result.maximumGzipKiB} KiB.`
  );
}

const optionalFeaturesPresent = Object.entries(markers)
  .filter(([, present]) => present)
  .map(([name]) => name);

if (optionalFeaturesPresent.length > 0) {
  throw new Error(
    `Home production JavaScript still includes disallowed feature graphs: ${optionalFeaturesPresent.join(', ')}.`
  );
}
