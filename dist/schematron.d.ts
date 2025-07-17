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
export declare function validate(inputFile: string, schema: string, jar?: string): Promise<SchematronAssert[]>;
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
export declare function runSchxslt(inputFile: string, schema: string, jar?: string): Promise<string>;
/**
 * Read an SVRL report, extract asserts and determine line and column numbers.
 *
 * @param file Report file in SVRL format
 * @returns Path to SVRL file.
 */
export declare function parseSVRL(file: string): SchematronAssert[];
