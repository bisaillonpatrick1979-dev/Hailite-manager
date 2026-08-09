import { readdir } from 'node:fs/promises';

const scriptsDirectory = new URL('./', import.meta.url);
const validators = (await readdir(scriptsDirectory))
  .filter(file => /^validate_.+\.ts$/.test(file))
  .sort();

for (const validator of validators) {
  console.log(`\n[${validator}]`);
  await import(new URL(validator, scriptsDirectory).href);
}

console.log(`\n${validators.length} validateurs spécialisés réussis.`);
