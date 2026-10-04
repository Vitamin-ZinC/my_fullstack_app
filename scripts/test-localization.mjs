import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const modules = new Map();
function readModule(file) {
  const absolute = path.resolve(file);
  if (modules.has(absolute)) return modules.get(absolute);
  const exports = {};
  modules.set(absolute, exports);
  const source = fs.readFileSync(absolute, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const aliases = { "@levelup/contracts": "packages/contracts/src/index.ts", "#localization": "packages/contracts/src/localization/index.ts", "#english-catalog": "packages/contracts/src/localization/english.ts" };
  const require = id => readModule(aliases[id] ?? path.resolve(path.dirname(absolute), id.replace(/\.js$/, ".ts")));
  vm.runInNewContext(js, { exports, require }, { filename: absolute });
  return exports;
}
const { englishCatalog } = readModule("packages/contracts/src/localization/english.ts");
const { ruSiteText, defaultSiteText, mergeSiteText } = readModule("apps/frontend/lib/messages.ts");
const { privacyPolicyDocument, publicOfferDocument } = readModule("apps/frontend/lib/legal.ts");
const { localizeStaticText } = readModule("packages/contracts/src/localization/index.ts");
let strings = 0;
function compareShape(ru, en, key = "root") {
  assert.equal(typeof ru, typeof en, key);
  if (typeof ru === "string") {
    strings += 1;
    assert.ok(!/[А-Яа-яЁё]/.test(en), `Untranslated English value at ${key}: ${en}`);
    const placeholders = text => [...text.matchAll(/\{+[^{}]+\}+/g)].map(match => match[0]).sort().join("|");
    assert.equal(placeholders(ru), placeholders(en), `Placeholders at ${key}`);
  } else if (Array.isArray(ru)) {
    assert.equal(en.length, ru.length, key);
    ru.forEach((item, index) => compareShape(item, en[index], `${key}[${index}]`));
  } else if (ru && typeof ru === "object") {
    assert.equal(Object.keys(en).join("|"), Object.keys(ru).join("|"), key);
    Object.keys(ru).forEach(name => compareShape(ru[name], en[name], `${key}.${name}`));
  }
}
compareShape(ruSiteText, defaultSiteText.en);
compareShape(privacyPolicyDocument, localizeStaticText(privacyPolicyDocument, "en"), "privacy");
compareShape(publicOfferDocument, localizeStaticText(publicOfferDocument, "en"), "offer");
for (const [source, english] of Object.entries(englishCatalog)) {
  assert.ok(english.length > 0, source);
  const placeholders = text => [...text.matchAll(/\{+[^{}]+\}+/g)].map(match => match[0]).sort().join("|");
  assert.equal(placeholders(source), placeholders(english), `Catalog placeholders: ${source}`);
}
const customized = mergeSiteText(defaultSiteText.en, { landing: { v2: { menu: { about: "Our story" } } } });
assert.equal(customized.landing.v2.menu.about, "Our story");
assert.equal(customized.landing.v2.menu.diagnostics, defaultSiteText.en.landing.v2.menu.diagnostics);
assert.equal(ruSiteText.landing.v2.menu.about, "О нас");
console.log(`Localization passed: ${strings} dictionary/legal leaves; ${Object.keys(englishCatalog).length} catalog entries; independent overrides`);
