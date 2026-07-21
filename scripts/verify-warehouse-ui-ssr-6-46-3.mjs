import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const htmlPath = resolve(process.env.TEMP || "/tmp", "wh-sales.html");
const html = readFileSync(htmlPath, "utf8");

const names = [
  "Коледино",
  "Электросталь",
  "Краснодар",
  "Самара",
  "Koledino",
  "Elektrostal",
  "Krasnodar",
  "Samara",
];

const report = { contexts: {}, primaryLinkLabels: [], cyrillicPrimaryLabels: [] };

for (const n of names) {
  const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const matches = [...html.matchAll(re)];
  report.contexts[n] = {
    count: matches.length,
    samples: matches.slice(0, 3).map((m) => {
      const idx = m.index ?? 0;
      return html.slice(Math.max(0, idx - 90), idx + n.length + 90).replace(/\s+/g, " ");
    }),
  };
}

const linkRe = /font-medium text-primary[^>]*>([^<]+)</g;
let m;
while ((m = linkRe.exec(html))) {
  report.primaryLinkLabels.push(m[1]);
}
report.cyrillicPrimaryLabels = report.primaryLinkLabels.filter((l) =>
  /[А-Яа-яЁё]/.test(l)
);

// Also check for rendered Latin warehouse names that prove SSR applied formatWarehouseName
report.hasLatinDisplay =
  report.primaryLinkLabels.some((l) => /Koledino|Elektrostal|Krasnodar|Kazan|Tula/.test(l)) ||
  />(Koledino|Elektrostal|Krasnodar)</.test(html);

report.passVisible =
  report.cyrillicPrimaryLabels.length === 0 && report.hasLatinDisplay;

mkdirSync(resolve("exports"), { recursive: true });
const outPath = resolve("exports/verify-warehouse-ui-ssr-6-46-3.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(report.passVisible ? "\nPASS visible warehouse labels" : "\nFAIL visible warehouse labels");
process.exit(report.passVisible ? 0 : 1);
