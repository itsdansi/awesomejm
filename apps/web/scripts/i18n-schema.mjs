import { readFile, readdir, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { fileURLToPath } from 'node:url';

const root = new URL('../src/i18n/', import.meta.url);
export function flattenCatalog(tree, prefix = '') {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => {
      const id = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string'
        ? [[id, value]]
        : Object.entries(flattenCatalog(value, id));
    }),
  );
}
export async function schemaSource() {
  const entries = {};
  for (const file of (await readdir(new URL('locales/en/', root))).sort()) {
    if (!file.endsWith('.json')) continue;
    Object.assign(
      entries,
      flattenCatalog(
        JSON.parse(await readFile(new URL(`locales/en/${file}`, root), 'utf8')),
        file.slice(0, -5),
      ),
    );
  }
  const lines = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const params = [
        ...new Set(
          [...value.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((match) => match[1]),
        ),
      ];
      const type = params.length
        ? `{ ${params.map((param) => `${param}: TranslationValue`).join('; ')} }`
        : 'never';
      return `  '${key}': ${type};`;
    });
  return format(
    `// Generated from locales/en by pnpm i18n:types. Do not edit by hand.\nexport type TranslationValue = string | number | bigint;\nexport interface TranslationSchema {\n${lines.join('\n')}\n}\nexport type TranslationKey = keyof TranslationSchema;\nexport type StaticTranslationKey = { [K in TranslationKey]: [TranslationSchema[K]] extends [never] ? K : never }[TranslationKey];\nexport type TranslationArgs<K extends TranslationKey> =\n  [TranslationSchema[K]] extends [never]\n    ? [values?: never]\n    : [values: TranslationSchema[K]];\n`,
    { ...(await resolveConfig(fileURLToPath(root))), parser: 'typescript' },
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('schema.d.ts', root),
    expected = await schemaSource();
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')) !== expected)
      throw new Error('Translation schema is stale. Run pnpm i18n:types.');
  } else await writeFile(file, expected);
}
