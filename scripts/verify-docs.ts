import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();
const fail = (message: string): never => {
  throw new Error(`[docs:check] ${message}`);
};
const posix = (value: string) => value.replaceAll('\\', '/');
const absolute = (path: string) => resolve(root, path);
const read = (path: string) => readFileSync(absolute(path), 'utf8');

const requiredRoot = ['AGENTS.md', 'README.md', 'docs/README.md'];
const canonicalDocs = [
  'docs/DOCUMENTATION_GOVERNANCE_HU.md',
  'docs/DOCS_INDEX_HU.md',
  'docs/STATUS_HU.md',
  'docs/ROADMAP_HU.md',
  'docs/product/PRODUCT_HU.md',
  'docs/product/MONETIZATION_HU.md',
  'docs/architecture/ARCHITECTURE_HU.md',
  'docs/features/shared/SHARED_CONTEXT_HU.md',
  'docs/operations/DEVELOPMENT_HU.md',
  'docs/operations/TESTING_HU.md',
  'docs/operations/DEPLOYMENT_HU.md',
  'docs/operations/BETA_HU.md',
  'docs/operations/BACKUP_HU.md',
  'docs/operations/RECOVERY_HU.md',
  'docs/operations/SECURITY_OPERATIONS_HU.md',
];

for (const path of [...requiredRoot, ...canonicalDocs]) {
  if (!existsSync(absolute(path))) fail(`required file is missing: ${path}`);
}

function frontmatterStatus(text: string): string | null {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const match = text.slice(4, end).match(/^status:\s*([^\s#]+)\s*$/m);
  return match?.[1] ?? null;
}

for (const path of canonicalDocs) {
  const status = frontmatterStatus(read(path));
  if (status !== 'canonical') {
    fail(
      `${path} must declare frontmatter status: canonical (found ${status ?? 'none'})`,
    );
  }
}

const docsIndex = read('docs/DOCS_INDEX_HU.md');
for (const path of canonicalDocs.filter(
  (path) => path !== 'docs/DOCS_INDEX_HU.md',
)) {
  const docsRelative = posix(relative('docs', path));
  if (!docsIndex.includes(docsRelative)) {
    fail(`DOCS_INDEX_HU.md does not reference canonical file: ${docsRelative}`);
  }
}

const decisionsDir = absolute('docs/decisions');
const adrFiles = readdirSync(decisionsDir).filter((name) =>
  /^ADR-\d{3}-.+\.md$/.test(name),
);
if (adrFiles.length === 0) fail('no ADR files found');

const adrNumbers = new Map<string, string>();
for (const name of adrFiles) {
  const number = name.match(/^ADR-(\d{3})-/)?.[1];
  if (!number) fail(`invalid ADR filename: ${name}`);
  const previous = adrNumbers.get(number);
  if (previous) fail(`duplicate ADR number ${number}: ${previous}, ${name}`);
  adrNumbers.set(number, name);

  const path = `docs/decisions/${name}`;
  if (frontmatterStatus(read(path)) !== 'canonical') {
    fail(`${path} must declare frontmatter status: canonical`);
  }
}

function walkMarkdown(dir: string): string[] {
  if (!existsSync(absolute(dir))) return [];
  const result: string[] = [];
  for (const name of readdirSync(absolute(dir))) {
    const path = posix(join(dir, name));
    const info = statSync(absolute(path));
    if (info.isDirectory()) result.push(...walkMarkdown(path));
    else if (name.endsWith('.md')) result.push(path);
  }
  return result;
}

for (const path of walkMarkdown('docs/archive')) {
  if (frontmatterStatus(read(path)) === 'canonical') {
    fail(`archived file cannot be canonical: ${path}`);
  }
}

const linkChecked = [
  ...requiredRoot,
  ...canonicalDocs,
  ...adrFiles.map((name) => `docs/decisions/${name}`),
];
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;

for (const source of linkChecked) {
  const text = read(source);
  for (const match of text.matchAll(markdownLink)) {
    let target = match[1]!.trim();
    if (
      !target ||
      target.startsWith('#') ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)
    ) {
      continue;
    }

    target = target.split('#', 1)[0]!.split('?', 1)[0]!;
    try {
      target = decodeURIComponent(target);
    } catch {
      fail(`invalid encoded Markdown link in ${source}: ${match[1]}`);
    }

    const resolved = normalize(join(dirname(source), target));
    const absoluteResolved = resolve(root, resolved);
    if (
      absoluteResolved !== root &&
      !absoluteResolved.startsWith(`${root}/`) &&
      !absoluteResolved.startsWith(`${root}\\`)
    ) {
      fail(`Markdown link escapes repository in ${source}: ${match[1]}`);
    }
    if (!existsSync(absoluteResolved)) {
      fail(
        `broken Markdown link in ${source}: ${match[1]} -> ${posix(resolved)}`,
      );
    }
  }
}

console.log(
  `[docs:check] ok: ${canonicalDocs.length} canonical docs, ${adrFiles.length} ADRs, ${linkChecked.length} link-checked files`,
);
