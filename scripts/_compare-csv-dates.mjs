import { readFileSync } from "fs";

function parseCsv(path) {
  const lines = readFileSync(path, "utf8").trim().split("\n").slice(1);
  return lines
    .map((line) => {
      const parts = line.split(",");
      const dateRaw = parts[0];
      if (!dateRaw || !dateRaw.includes("/")) return null;
      const [m, d, y] = dateRaw.split("/");
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const nums = parts.slice(1).map((v) => (v === "" ? null : Number(v)));
      return {
        iso,
        sales: nums[0] ?? 0,
        wbFee: nums[1] ?? 0,
        logistics: nums[2] ?? 0,
        storage: nums[3] ?? 0,
        total: nums[9] ?? 0,
        balance: nums[10],
        hasData: (nums[0] ?? 0) !== 0 || (nums[9] ?? 0) !== 0,
      };
    })
    .filter(Boolean);
}

function summarize(rows, from, to) {
  const inRange = rows.filter((r) => r.iso >= from && r.iso <= to);
  const withData = inRange.filter((r) => r.hasData);
  const sum = (key) =>
    Math.round(withData.reduce((acc, row) => acc + row[key], 0) * 100) / 100;

  return {
    rowCountInRange: inRange.length,
    daysWithData: withData.length,
    firstDay: withData[0]?.iso ?? null,
    lastDay: withData[withData.length - 1]?.iso ?? null,
    sales: sum("sales"),
    wbFee: sum("wbFee"),
    logistics: sum("logistics"),
    storage: sum("storage"),
    dailyNetTotal: sum("total"),
    endingBalance: withData[withData.length - 1]?.balance ?? null,
  };
}

const FROM = "2026-07-01";
const TO = "2026-07-12";

const csv1 = parseCsv("C:/Users/User/Downloads/New balance details (1).csv");
const csv2 = parseCsv("C:/Users/User/Downloads/New balance details.csv");

console.log(
  JSON.stringify(
    {
      dashboardFilter: {
        from: FROM,
        to: TO,
        rule: "inclusive calendar days: column >= from AND column <= to",
        urlParams: `?from=${FROM}&to=${TO}&account=2`,
      },
      csvNewBalanceDetails1: {
        fileRange: {
          firstRow: csv1.find((r) => r.hasData)?.iso,
          lastRowWithData: [...csv1].reverse().find((r) => r.hasData)?.iso,
          totalRows: csv1.length,
          emptyTailFrom: csv1.find((r) => !r.hasData)?.iso ?? null,
        },
        filteredJul1to12: summarize(csv1, FROM, TO),
      },
      csvNewBalanceDetails: {
        fileRange: {
          firstRow: csv2[0]?.iso,
          lastRow: csv2[csv2.length - 1]?.iso,
          totalRows: csv2.length,
        },
        filteredJul1to12: summarize(csv2, FROM, TO),
      },
      dailyComparisonJul1to12: csv1
        .filter((r) => r.iso >= FROM && r.iso <= TO && r.hasData)
        .map((r) => ({
          date: r.iso,
          csvSales: r.sales,
          csvDailyNet: r.total,
          csvBalance: r.balance,
        })),
    },
    null,
    2
  )
);
