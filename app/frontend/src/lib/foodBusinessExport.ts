/** Excel-friendly report export. Text cells cannot execute spreadsheet formulas. */
export function reportCsv(rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
    const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
