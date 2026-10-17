import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { documents, legalVersion } from '../src/content/legal-data.mjs';
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const check = process.argv.includes('--check');
for (const [language, list] of Object.entries(documents)) {
  for (const [key, doc] of Object.entries(list)) {
    const suffix = language === 'kz' ? '-kz' : '';
    const nav = Object.entries(list).map(([id, item]) => `<a href="/${id}${suffix}.html">${escape(item.title)}</a>`).join(' · ');
    const body = doc.sections.map(s => `<section><h2>${escape(s.heading)}</h2><p>${escape(s.body)}</p></section>`).join('\n');
    const html = `<!DOCTYPE html>\n<!-- Generated from legal-data.mjs; version ${legalVersion}. -->\n<html lang="${language === 'kz' ? 'kk' : 'ru'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(doc.title)} — Sortirovka24</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:auto;padding:24px 16px 48px;line-height:1.65;color:#111}h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:1.5rem}a{color:#175ac7}nav{font-size:.9rem}.meta{color:#555}</style></head><body><a href="/">Sortirovka24</a><h1>${escape(doc.title)}</h1><p class="meta">${escape(doc.updated)} · ${legalVersion}</p><nav>${nav}<br><a href="/${key}${language === 'kz' ? '' : '-kz'}.html">${language === 'kz' ? 'Русский' : 'Қазақша'}</a></nav>${body}<hr><p><a href="https://www.gov.kz/memleket/entities/mti-kzpp?lang=${language === 'kz' ? 'kk' : 'ru'}">${language === 'kz' ? 'Тұтынушылардың құқықтарын қорғау комитеті: байланыстар және сотқа дейінгі реттеу' : 'Комитет по защите прав потребителей: контакты и досудебное урегулирование'}</a> · <a href="https://eotinish.kz/">e-Otinish</a></p></body></html>\n`;
    const path = fileURLToPath(new URL(`../public/${key}${suffix}.html`, import.meta.url));
    if (check) {
      if (await readFile(path, 'utf8') !== html) throw new Error(`Outdated legal page: ${path}`);
    } else await writeFile(path, html, 'utf8');
  }
}
console.log(check ? 'Legal HTML matches canonical documents (8 pages).' : 'Generated 8 legal pages.');
// Archive exact accepted texts with hashes alongside the backend receipt reader.
const manifest = { version: legalVersion, documents: Object.fromEntries(Object.entries(documents).map(([lang, list]) => [lang,
  Object.fromEntries(Object.entries(list).map(([key, doc]) => [key, { sha256: createHash('sha256').update(JSON.stringify(doc)).digest('hex'), document: doc }]))])) };
const archive = fileURLToPath(new URL(`../../backend/core/legal-archive/${legalVersion}.json`, import.meta.url));
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  if (await readFile(archive, 'utf8') !== manifestText) throw new Error('Backend legal archive differs from displayed documents');
} else {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(fileURLToPath(new URL('../../backend/core/legal-archive/', import.meta.url)), { recursive: true });
  try {
    const existing = await readFile(archive, 'utf8');
    if (existing !== manifestText) throw new Error('Published legal version is immutable; increment legalVersion before changing its text.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(archive, manifestText, 'utf8');
  }
}
