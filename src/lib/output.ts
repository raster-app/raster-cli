export type OutputContext = {
  json: boolean;
  verbose: boolean;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export function printJson(output: OutputContext, payload: unknown): void {
  output.stdout(`${JSON.stringify(payload, null, 2)}\n`);
}

export function note(output: OutputContext, message: string): void {
  output.stderr(`${message}\n`);
}

export function verboseLog(output: OutputContext, message: string): void {
  if (output.verbose) output.stderr(`${message}\n`);
}

export type TableColumn<Row> = {
  header: string;
  value: (row: Row) => string;
};

export function renderTable<Row>(output: OutputContext, rows: Row[], columns: Array<TableColumn<Row>>): void {
  if (rows.length === 0) {
    output.stdout("(none)\n");
    return;
  }
  const lines = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, columnIndex) => {
    let width = column.header.length;
    for (const line of lines) {
      width = Math.max(width, line[columnIndex]?.length ?? 0);
    }
    return width;
  });
  const renderLine = (line: string[]): string =>
    line
      .map((cell, columnIndex) => cell.padEnd(widths[columnIndex] ?? 0))
      .join("  ")
      .trimEnd();
  output.stdout(`${renderLine(columns.map((column) => column.header))}\n`);
  for (const line of lines) {
    output.stdout(`${renderLine(line)}\n`);
  }
}

export type RecordField = {
  label: string;
  value: string;
};

export function renderRecord(output: OutputContext, fields: RecordField[]): void {
  let labelWidth = 0;
  for (const field of fields) {
    labelWidth = Math.max(labelWidth, field.label.length);
  }
  for (const field of fields) {
    output.stdout(`${field.label.padEnd(labelWidth)}  ${field.value}\n`);
  }
}
