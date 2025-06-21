import * as core from '@actions/core';
import { exec, ExecOptions } from '@actions/exec';
import glob from '@actions/glob';
import { dirname, join } from 'path';
import { getParams, trimFilePath } from './utils.js';

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

    const { schema, version, files, warnOnly } = getParams();
    core.debug(`schema '${schema}'`);
    core.debug(`version '${version}'`);
    core.debug(`files '${files}'`);
    core.debug(`warn-only '${warnOnly ? 'yes' : 'no'}'`);

    // the schema directory is expected next to the one containing index.js
    const schemaDir = join(dirname(import.meta.dirname), 'schemas');
    core.debug(`schemaDir '${schemaDir}'`);

    let schemaTitle, rngFileName, schematronFileName;
    if (schema === 'all') {
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

    core.summary.addHeading(`Validation against ${schemaTitle}`);

    const globber = await glob.create(files);
    const filePaths = await globber.glob();
    console.log(filePaths);

    let jingOutput = '';
    const errors: ValidationError[] = [];

    const options: ExecOptions = {
      listeners: {
        stdout: (data: Buffer) => {
          jingOutput += data.toString();
        },
      },
    };

    if (filePaths.length) {
      core.summary.addRaw(`Files found: ${filePaths.length}`);
      core.summary.addBreak();

      try {
        await exec('jing', [rngFile, ...filePaths], options);
        core.debug('jing run successful');
      } catch {
        core.debug('jing exited with errors');
      }

      jingOutput.split('\n').forEach((line) => {
        const m = line.match(/^([^:]+):([0-9]+):([0-9]+): ([^:]+): (.+)$/);
        if (m) {
          const file = trimFilePath(m[1]);
          const lineNumber = parseInt(m[2]);
          const columnNumber = parseInt(m[3]);
          const type = m[4];
          const message = m[5];
          errors.push({ file, lineNumber, columnNumber, type, message });
          if (type === 'error') {
            core.error(message, {
              title: 'validation error',
              file,
              startLine: lineNumber,
              startColumn: columnNumber,
            });
          }
        }
      });
      const uniqueErrors = errors
        .map((e) => e.message)
        .filter((m, i, a) => a.indexOf(m) === i);
      const uniqueFiles = errors
        .map((e) => e.file)
        .filter((f, i, a) => a.indexOf(f) === i);
      core.summary.addRaw(`Total files validated: ${filePaths.length}`);
      core.summary.addBreak();
      core.summary.addRaw(`Files with errors: ${uniqueFiles.length}`);
      core.summary.addBreak();
      core.summary.addRaw(`Total number of errors: ${errors.length}`);
      core.summary.addBreak();
      core.summary.addRaw(`Unique errors: ${uniqueErrors.length}`);
      core.summary.addBreak();
    } else {
      core.debug(`No files found. ('${files}')`);
      core.summary.addRaw(`No files found. ('${files}')`);
    }
    console.log(core.summary.stringify());
    if (process.env.GITHUB_STEP_SUMMARY) {
      core.summary.write();
    }
    core.setOutput('errors', errors.length);
    if (!warnOnly && errors.length > 0) {
      core.setFailed('Invalid documents');
    }
  } catch (error) {
    console.log(error);
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message);
  }
}
