export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[=+@\t\r]/.test(text) || /^-[^\d]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv =
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
