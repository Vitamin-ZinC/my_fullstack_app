import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";

const root = process.cwd();
const sources = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (file.endsWith(".tsx")) sources.push(file);
  }
}
scan(path.join(root, "apps/frontend/app"));
scan(path.join(root, "apps/frontend/components"));
sources.push(path.join(root, "apps/frontend/lib/messages.ts"), path.join(root, "apps/frontend/lib/legal.ts"));
sources.push(path.join(root, "apps/backend/src/services/habitCatalog.ts"));
sources.push(path.join(root, "apps/backend/src/services/aiReport.ts"));
for (const file of ["routes/habits.ts", "routes/coachWorkspace.ts", "routes/coaches.ts", "routes/demo.ts", "routes/me.ts", "services/coachPartnership.ts", "services/coachCommerce.ts", "services/coachRules.ts", "services/coachPlatform.ts", "services/pricing.ts", "services/report.ts"]) {
  sources.push(path.join(root, "apps/backend/src", file));
}
const catalog = new Map();
const cyrillic = /[А-Яа-яЁё]/;
function add(text, file) {
  if (!cyrillic.test(text)) return;
  const key = text.trim().replace(/\s+/g, " ");
  const files = catalog.get(key) ?? new Set();
  files.add(path.relative(root, file).replaceAll("\\", "/"));
  catalog.set(key, files);
}
for (const file of sources) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (file.includes(`${path.sep}backend${path.sep}`) && ts.isFunctionDeclaration(node) && /prompt/i.test(node.name?.text ?? "")) return;
    if (file.includes(`${path.sep}backend${path.sep}`) && ts.isObjectLiteralExpression(node)
      && node.properties.some(item => ts.isPropertyAssignment(item) && item.name.getText(source) === "role" && ts.isStringLiteral(item.initializer) && item.initializer.text === "system")) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) add(node.text, file);
    if (ts.isTemplateExpression(node)) {
      let text = node.head.text;
      node.templateSpans.forEach((span, index) => { text += `{v${index}}${span.literal.text}`; });
      add(text, file);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (file.endsWith("lib/messages.ts") || file.endsWith("lib/legal.ts")) {
    const exports = {};
    const compiled = ts.transpileModule(source.text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(compiled, { exports, require: () => ({ localizeStaticText: value => value }) });
    function staticStrings(value) {
      if (typeof value === "string") add(value, file);
      else if (value && typeof value === "object") Object.values(value).forEach(staticStrings);
    }
    staticStrings(file.endsWith("messages.ts") ? exports.ruSiteText : [exports.privacyPolicyDocument, exports.publicOfferDocument]);
  }
}
for (const phrase of ["До 5 клиентов", "До 15 клиентов", "До 30 клиентов", "Индивидуальный пакет", "Кабинет коуча и доступ для пяти клиентов", "Для устойчивой частной практики", "Для групп и растущей практики", "Для команд и больших программ", "Стандартный сайт", "Язык"]) {
  add(phrase, path.join(root, "apps/backend/prisma/migrations/20260812190000_coach_platform/migration.sql"));
}
fs.mkdirSync("output/localization", { recursive: true });
fs.writeFileSync("output/localization/inventory.json", JSON.stringify([...catalog].map(([text, files]) => ({ text, files: [...files] })), null, 2));
const counts = {};
for (const [, files] of catalog) for (const file of files) counts[file] = (counts[file] ?? 0) + 1;
console.log(JSON.stringify({ phrases: catalog.size, counts }, null, 2));
