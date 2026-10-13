export function tablePage<T>(rows: readonly T[], requestedPage: number, pageSize = 50) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.max(1, Math.min(pages, Math.trunc(requestedPage) || 1));
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page, pages, total: rows.length,
    from: rows.length ? start + 1 : 0, to: Math.min(start + pageSize, rows.length) };
}
