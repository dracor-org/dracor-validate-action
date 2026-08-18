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
 * Validate an XML file against a Schematron rule set.
 *
 * Under schxslt2 the compilation step (Schematron → validator XSLT) is done
 * ahead of time at Docker build time, so at runtime we only need to apply
 * a compiled validator XSLT to the input document. The XSLT is executed by
 * Saxon-HE.
 *
 * @param inputFile XML file to validate
 * @param validatorXsl Precompiled validator XSLT (produced by schxslt2 at
 *   image build time from the corresponding `.sch` file)
 * @param classpath Java classpath containing Saxon-HE and its runtime
 *   dependencies (e.g. xmlresolver)
 * @returns Array of assert objects.
 */
export async function validate(
  inputFile: string,
  validatorXsl: string,
  classpath: string = 'saxon.jar'
): Promise<SchematronAssert[]> {
  const report = await runSchxslt(inputFile, validatorXsl, classpath);
  core.debug(report);
  return parseSVRL(report);
}

/**
 * Apply a precompiled Schematron validator XSLT to `inputFile` via Saxon-HE
 * and return the path to the resulting SVRL report.
 *
 * @param inputFile XML file to validate
 * @param validatorXsl Precompiled validator XSLT
 * @param classpath Java classpath containing Saxon-HE and its runtime
 *   dependencies
 * @returns Path to SVRL file.
 */
export async function runSchxslt(
  inputFile: string,
  validatorXsl: string,
  classpath: string = 'saxon.jar'
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'report-'));
  const reportFile = join(dir, 'svrl.xml');
  try {
    await exec('java', [
      '-cp',
      classpath,
      'net.sf.saxon.Transform',
      `-s:${inputFile}`,
      `-xsl:${validatorXsl}`,
      `-o:${reportFile}`,
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
  const doc = new DOMParser({ locator: true }).parseFromString(
    xml,
    'text/xml'
  ) as unknown as Document;
  teiDocs[path] = doc;
  return doc;
}

/**
 * Read an SVRL report, extract asserts and determine line and column numbers.
 *
 * @param file Report file in SVRL format
 * @returns Array of assert objects.
 */
export function parseSVRL(file: string): SchematronAssert[] {
  const reportXML = readFileSync(file, 'utf8');
  const reportDoc = new DOMParser({
    onError: (level, message) => {
      if (level === 'fatalError') {
        console.error(message);
      }
    },
  }).parseFromString(reportXML, 'text/xml') as unknown as Node;

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

    // schxslt2 places @role, @context, and @document on the preceding
    // fired-rule. patternName comes back-referenced on the assertion
    // itself via @patternId (schxslt2 addition; strip the boilerplate
    // "schematron-constraint-" prefix and the trailing "-<n>" suffix).
    const [rule] = select(
      'preceding-sibling::svrl:fired-rule[1]',
      assert
    ) as Node[];
    const context = select('string(@context)', rule) as string;
    const role = select('string(@role)', rule) as string;
    const document = (select('string(@document)', rule) as string).replace(
      /^file:/,
      ''
    );
    const patternName = (select('string(@patternId)', assert) as string)
      .replace(/^schematron-constraint-/, '')
      .replace(/-\d+$/, '');

    const doc = getDoc(document);
    // @ts-expect-error figure out how to type node
    const [node] = select(location, doc);
    const { lineNumber, columnNumber } = node ?? {};
    const fileName = basename(document);
    results.push({
      text: text
        .replaceAll('<', '&lt;')
        .replaceAll(/@([^\s]+)/g, '<code>@$1</code>'),
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
