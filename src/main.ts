import * as core from '@actions/core';
import { exec, ExecOptions } from '@actions/exec';
import glob from '@actions/glob';
import { dirname, join } from 'path';
import { SummaryTableRow } from '@actions/core/lib/summary.js';
import {
  getParams,
  makeLink,
  trimFilePath,
  truncateJingMessage,
} from './utils.js';
import { validate } from './schematron.js';

interface ValidationError {
  message: string;
  type: string;
  file: string;
  lineNumber: number;
  columnNumber: number;
}

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    core.debug(`cwd '${process.cwd()}'`);

    let numErrors = 0;
    let numWarnings = 0;

    const sha = process.env.GITHUB_SHA;
    if (sha) {
      core.debug(`commit '${sha}'`);
    }

    const { schema, version, files, warnOnly } = getParams();
    core.debug(`schema '${schema}'`);
    core.debug(`version '${version}'`);
    core.debug(`files '${files}'`);
    core.debug(`warn-only '${warnOnly ? 'yes' : 'no'}'`);

    // the schema directory is expected next to the one containing index.js
    const schemaDir = join(dirname(import.meta.dirname), 'schemas');
    core.debug(`schemaDir '${schemaDir}'`);

    let schemaTitle, rngFileName, schematronFileName;
    if (schema === 'tei') {
      schemaTitle = `TEI-All ${version}`;
      rngFileName = `tei_all_${version}.rng`;
    } else if (schema === 'dracor') {
      schemaTitle = `DraCor Schema ${version}`;
      rngFileName = `dracor_${version}.rng`;
      schematronFileName = `dracor_${version}.sch`;
    } else {
      throw new Error(`Unknown schema "${schema}"`);
    }
    const rngFile = join(schemaDir, rngFileName);

    core.debug(`schemaTitle '${schemaTitle}'`);
    core.debug(`rngFileName '${rngFileName}'`);
    core.debug(`rngFile '${rngFile}'`);
    core.debug(`schematronFileName '${schematronFileName}'`);

    core.summary.addHeading(`Validation against ${schemaTitle}`, '2');

    const globber = await glob.create(files);
    const filePaths = await globber.glob();
    console.log(filePaths);

    let jingOutput = '';
    const issues: ValidationError[] = [];

    const options: ExecOptions = {
      listeners: {
        stdout: (data: Buffer) => {
          jingOutput += data.toString();
        },
      },
    };

    if (filePaths.length) {
      try {
        await exec('jing', [rngFile, ...filePaths], options);
        core.debug('jing ran successfully');
      } catch {
        core.debug('jing exited with errors');
      }

      const errorRows: SummaryTableRow[] = [];

      jingOutput.split('\n').forEach((line) => {
        const m = line.match(/^([^:]+):([0-9]+):([0-9]+): ([^:]+): (.+)$/);
        if (m) {
          const file = trimFilePath(m[1]);
          const lineNumber = parseInt(m[2]);
          const columnNumber = parseInt(m[3]);
          const type = m[4];
          const message = m[5];
          issues.push({ file, lineNumber, columnNumber, type, message });
          errorRows.push([
            makeLink(file, lineNumber),
            `${lineNumber}:${columnNumber}`,
            type === 'error' ? '❌' : '⚠️',
            truncateJingMessage(message),
          ]);
        }
      });

      if (schematronFileName) {
        const schematronFile = join(schemaDir, schematronFileName);
        const jar = '/usr/src/app/schxslt-cli.jar';
        for (const f of filePaths) {
          const asserts = await validate(f, schematronFile, jar);
          asserts.forEach(
            ({ document, role, text, lineNumber = 0, columnNumber = 0 }) => {
              // for now we skip informational messages
              if (role !== 'information') {
                const file = trimFilePath(document);
                issues.push({
                  file,
                  message: text,
                  type: role || 'error',
                  lineNumber,
                  columnNumber,
                });
                errorRows.push([
                  makeLink(file, lineNumber),
                  `${lineNumber}:${columnNumber}`,
                  role === 'warning' ? '⚠️' : '❌',
                  `<small>${text}</small>`,
                ]);
              }
            }
          );
        }
      }

      const uniqueIssues = issues
        .map((e) => e.message)
        .filter((m, i, a) => a.indexOf(m) === i);
      const uniqueFiles = issues
        .map((e) => e.file)
        .filter((f, i, a) => a.indexOf(f) === i);
      numErrors = issues.filter((e) => e.type === 'error').length;
      numWarnings = issues.filter((e) => e.type === 'warning').length;
      const stats = [
        `Total files validated: ${filePaths.length}`,
        `Files with issues: ${uniqueFiles.length}`,
      ];
      if (issues.length > 0) {
        stats.push(
          `Total number of issues: ${issues.length}`,
          `Unique issues: ${uniqueIssues.length}`,
          `Errors: ${numErrors}`,
          `Warnings: ${numWarnings}`
        );
      }
      core.summary.addList(stats);
      if (errorRows.length) {
        errorRows.unshift([
          { data: 'File', header: true },
          { data: 'Line:Col', header: true },
          { data: 'Type', header: true },
          { data: 'Message', header: true },
        ]);
        core.summary.addTable(errorRows);
      }
    } else {
      core.debug(`No files found. ('${files}')`);
      core.summary.addRaw(`No files found. ('${files}')`);
    }

    try {
      // if $GITHUB_STEP_SUMMARY is set we try to write otherwise we dump the
      // summary to the console
      if (process.env.GITHUB_STEP_SUMMARY) {
        core.summary.write();
      } else {
        console.log(core.summary.stringify());
      }
    } catch (error) {
      console.log(process.env);
      console.log(error);
    }
    if (!warnOnly && numErrors > 0) {
      core.setFailed('Invalid documents');
    }
  } catch (error) {
    console.log(error);
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message);
  }
}
