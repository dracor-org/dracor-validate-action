import * as core from '@actions/core';
import { exec, ExecOptions } from '@actions/exec';
import { dirname, join } from 'path';
import {
  getParams,
  makeLink,
  resolveFiles,
  trimFilePath,
  truncateJingMessage,
} from './utils.js';
import { validate } from './schematron.js';
import { formatTextSummary } from './textSummary.js';

interface ValidationError {
  message: string;
  type: string;
  file: string;
  lineNumber: number;
  columnNumber: number;
}

// Structural copy of @actions/core's SummaryTableRow. That type lives in
// @actions/core/lib/summary.js which is walled off by the package's
// `exports` field starting in v3, so we can't import it directly.
type SummaryTableCell =
  | string
  | { data: string; header?: boolean; colspan?: string; rowspan?: string };
type SummaryTableRow = SummaryTableCell[];

const ERRLIMIT = 1000;

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

    let schemaTitle, rngFileName, schematronXslFileName;
    if (schema === 'tei') {
      schemaTitle = `TEI-All ${version}`;
      rngFileName = `tei_all_${version}.rng`;
    } else if (schema === 'dracor') {
      schemaTitle = `DraCor Schema ${version}`;
      rngFileName = `dracor_${version}.rng`;
      // Precompiled at Docker build time from `dracor_${version}.sch` using
      // the schxslt2 transpiler.
      schematronXslFileName = `dracor_${version}.xsl`;
    } else {
      throw new Error(`Unknown schema "${schema}"`);
    }
    const rngFile = join(schemaDir, rngFileName);

    core.debug(`schemaTitle '${schemaTitle}'`);
    core.debug(`rngFileName '${rngFileName}'`);
    core.debug(`rngFile '${rngFile}'`);
    core.debug(`schematronXslFileName '${schematronXslFileName}'`);

    core.summary.addHeading(`Validation against ${schemaTitle}`, '2');

    const filePaths = await resolveFiles(files);
    console.log(filePaths);

    let jingOutput = '';
    const issues: ValidationError[] = [];
    const stats: string[] = [];

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
      const warningRows: SummaryTableRow[] = [];

      jingOutput.split('\n').forEach((line) => {
        const m = line.match(/^([^:]+):([0-9]+):([0-9]+): ([^:]+): (.+)$/);
        if (m) {
          const file = trimFilePath(m[1]);
          const lineNumber = parseInt(m[2]);
          const columnNumber = parseInt(m[3]);
          const type = m[4];
          const message = m[5];
          issues.push({ file, lineNumber, columnNumber, type, message });
          const row: SummaryTableRow = [
            makeLink(file, lineNumber),
            `${lineNumber}:${columnNumber}`,
            truncateJingMessage(message),
          ];
          if (type === 'error' || type === 'fatal') {
            errorRows.push(row);
          } else {
            warningRows.push(row);
          }
        }
      });

      if (schematronXslFileName) {
        const validatorXsl = join(schemaDir, schematronXslFileName);
        const classpath = '/usr/src/app/saxon.jar:/usr/src/app/xmlresolver.jar';
        for (const f of filePaths) {
          const asserts = await validate(f, validatorXsl, classpath);
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
                const row: SummaryTableRow = [
                  makeLink(file, lineNumber),
                  `${lineNumber}:${columnNumber}`,
                  `<small>${text}</small>`,
                ];
                if (role === 'warning') {
                  warningRows.push(row);
                } else {
                  errorRows.push(row);
                }
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
      numErrors = issues.filter(
        (e) => e.type === 'error' || e.type === 'fatal'
      ).length;
      numWarnings = issues.filter((e) => e.type === 'warning').length;
      stats.push(
        `Total files validated: ${filePaths.length}`,
        `Files with issues: ${uniqueFiles.length}`
      );
      if (issues.length > 0) {
        stats.push(
          `Total number of issues: ${issues.length}`,
          `Unique issues: ${uniqueIssues.length}`,
          `Errors: ${numErrors}`,
          `Warnings: ${numWarnings}`
        );
      }
      core.summary.addList(stats);

      const header: SummaryTableRow = [
        { data: 'File', header: true },
        { data: 'Line:Col', header: true },
        { data: 'Message', header: true },
      ];
      // ERRLIMIT caps the total rows across both tables to keep the summary
      // under GitHub's size limit; errors get priority.
      const total = errorRows.length + warningRows.length;
      const errorSlots = Math.min(errorRows.length, ERRLIMIT);
      const warningSlots = Math.min(
        warningRows.length,
        Math.max(0, ERRLIMIT - errorSlots)
      );

      if (errorSlots > 0) {
        core.summary.addHeading('Errors', '3');
        core.summary.addTable([header, ...errorRows.slice(0, errorSlots)]);
      }
      if (warningSlots > 0) {
        core.summary.addHeading('Warnings', '3');
        core.summary.addTable([header, ...warningRows.slice(0, warningSlots)]);
      }
      if (total > ERRLIMIT) {
        core.summary.addRaw(
          `<em>Output truncated: showing ${ERRLIMIT} of ${total} issues.</em>`,
          true
        );
      }
    } else {
      core.debug(`No files found. ('${files}')`);
      core.summary.addRaw(`No files found. ('${files}')`);
    }

    try {
      // If we're running inside a GitHub workflow, write the HTML summary to
      // $GITHUB_STEP_SUMMARY so it renders in the Actions UI. Otherwise
      // (local `docker run` / `./validate`) print a plain-text rendering to
      // stdout — the HTML summary is only noise on a terminal.
      if (process.env.GITHUB_STEP_SUMMARY) {
        core.summary.write();
      } else if (filePaths.length) {
        console.log(formatTextSummary(schemaTitle, stats, issues));
      } else {
        console.log(`No files found. ('${files}')`);
      }
    } catch (error) {
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
