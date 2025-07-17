import * as core from '@actions/core';
import { relative } from 'path';
import { DRACOR_VERSION, TEI_VERSION } from './config.js';

export interface Params {
  schema: string;
  version: string;
  files: string;
  warnOnly: boolean;
}

export function trimFilePath(path: string) {
  return relative(process.cwd(), path);
}

export function defaultVersion(schema: string): string {
  if (schema === 'dracor') {
    return DRACOR_VERSION;
  }
  return TEI_VERSION;
}

export function getParams(): Params {
  const schema = core.getInput('schema') || 'tei';
  const version = core.getInput('version') || defaultVersion(schema);
  const files = core.getInput('files') || 'tei/*.xml';
  const warnOnly = /^(yes|true)$/i.test(core.getInput('warn-only'));
  return { schema, version, files, warnOnly };
}
