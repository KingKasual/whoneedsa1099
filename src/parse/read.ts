/** Convert raw file contents to rows. Runs entirely in the browser (or Node for tests). */
import Papa from 'papaparse';
import { read as readXlsx, utils as xlsxUtils } from 'xlsx';
import { parseRows, type ParsedFile, type ParseOptions } from './parse';

type Cell = string | number | boolean | Date | null | undefined;

export function csvToRows(text: string): Cell[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  return res.data;
}

export function xlsxToRows(buf: ArrayBuffer | Uint8Array): Cell[][] {
  const wb = readXlsx(buf, { type: 'array', cellDates: false, dense: true });
  const first = wb.SheetNames[0];
  const sheet = first ? wb.Sheets[first] : undefined;
  if (!sheet) return [];
  return xlsxUtils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, blankrows: false, defval: null });
}

export function isSpreadsheet(name: string): boolean {
  return /\.(xlsx|xls|xlsm|ods)$/i.test(name);
}

export function parseContent(name: string, content: string | ArrayBuffer | Uint8Array, opts?: ParseOptions): ParsedFile {
  const rows =
    typeof content === 'string' ? csvToRows(content) : isSpreadsheet(name) ? xlsxToRows(content) : csvToRows(new TextDecoder().decode(content));
  return parseRows(name, rows, opts);
}

/** Browser helper. */
export async function parseBrowserFile(file: File, opts?: ParseOptions): Promise<ParsedFile> {
  const content = isSpreadsheet(file.name) ? await file.arrayBuffer() : await file.text();
  return parseContent(file.name, content, opts);
}
