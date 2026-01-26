import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { exec } from '@actions/exec';
import * as core from '@actions/core';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';

export interface SchematronAssert {
  text: string;
  location: string;
  role: string;
  context: string;
  patternName: string;
  document: string;
  lineNumber?: number;
  columnNumber?: number;
  fileName: string;
}

/**
 * Validate XML file using the Schxslt schematron processor.
 *
 * This function expects the Schxslt CLI JAR file to be in the current working
 * directory. Alternatively the path to the JAR can be passed in as the third
 * argument.
 *
 * @param inputFile XML file to validate
 * @param schema Schematron file
 * @param jar Path to the schxslt-cli.jar
 * @returns Array of assert objects.
 */
export async function validate(
  inputFile: string,
  schema: string,
  jar: string = 'schxslt-cli.jar'
): Promise<SchematronAssert[]> {
  const report = await runSchxslt(inputFile, schema, jar);
  core.debug(report);
  return parseSVRL(report);
}

/**
 * Run Schxslt schematron processor on input file with given schema.
 *
 * This function expects the Schxslt CLI JAR file to be in the current working
 * directory. Alternatively the path to the JAR can be passed in as the third
 * argument.
 *
 * @param inputFile XML file to validate
 * @param schema Schematron file
 * @param jar Path to the schxslt-cli.jar
 * @returns Path to SVRL file.
 */
export async function runSchxslt(
  inputFile: string,
  schema: string,
  jar: string = 'schxslt-cli.jar'
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'report-'));
  const reportFile = join(dir, 'svrl.xml');
  try {
    await exec('java', [
      '-jar',
      jar,
      '-d',
      inputFile,
      '-s',
      schema,
      '-o',
      reportFile,
    ]);
    core.debug(`schxslt ran successful on ${inputFile}`);
  } catch (error) {
    core.debug(`schxslt error for ${inputFile}`);
    console.log(error);
  }
  return reportFile;
}

const teiDocs: { [path: string]: Document } = {};
function getDoc(path: string) {
  if (teiDocs[path]) {
    return teiDocs[path];
  }
  const xml = readFileSync(path, 'utf8');
  const doc = new DOMParser({ locator: {} }).parseFromString(xml);
  teiDocs[path] = doc;
  return doc;
}

/**
 * Read an SVRL report, extract asserts and determine line and column numbers.
 *
 * @param file Report file in SVRL format
 * @returns Path to SVRL file.
 */
export function parseSVRL(file: string): SchematronAssert[] {
  const reportXML = readFileSync(file, 'utf8');
  const reportDoc = new DOMParser({
    errorHandler: {
      warning: function () {},
      error: function () {},
      fatalError: function (e) {
        console.error(e);
      },
    },
  }).parseFromString(reportXML);

  const select = xpath.useNamespaces({
    svrl: 'http://purl.oclc.org/dsdl/svrl',
    tei: 'http://www.tei-c.org/ns/1.0',
  });

  const asserts = select(
    '//svrl:*[(local-name() = "failed-assert" or local-name() = "successful-report") and @location and svrl:text]',
    reportDoc
  ) as Node[];

  const results: SchematronAssert[] = [];

  asserts.forEach((assert) => {
    const text = select('normalize-space(svrl:text[1])', assert) as string;
    const location = (select('string(@location)', assert) as string).replaceAll(
      'Q{http://www.tei-c.org/ns/1.0}',
      'tei:'
    );

    const [rule] = select(
      'preceding-sibling::svrl:fired-rule[1]',
      assert
    ) as Node[];
    const context = select('string(@context)', rule) as string;
    const role = select('string(@role)', rule) as string;
    const [pattern] = select(
      'preceding-sibling::svrl:active-pattern[1]',
      assert
    ) as Node[];
    const patternName = select('string(@name)', pattern) as string;
    const document = (select('string(@documents)', pattern) as string).replace(
      /^file:/,
      ''
    );
    const doc = getDoc(document);
    // @ts-expect-error figure out how to type node
    const [node] = select(location, doc);
    const { lineNumber, columnNumber } = node;
    const fileName = basename(document);
    results.push({
      text: text.replaceAll('<', '&lt;').replaceAll('@', '&#x40;'),
      location,
      role,
      context,
      patternName,
      document,
      lineNumber,
      columnNumber,
      fileName,
    });
  });

  return results;
}
