/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals';
import * as core from '../__fixtures__/core.js';
import * as exec from '../__fixtures__/exec.js';

const validate = jest.fn(async () => [] as unknown[]);

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core);
jest.unstable_mockModule('@actions/exec', () => exec);
jest.unstable_mockModule('../src/schematron.js', () => ({ validate }));

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js');

const twoErrorOutput = `/invalid.xml:10:36: error: attribute "foo" not allowed
/invalid.xml:456:78: error: element "bar" not allowed`;

const mockJingExecSuccess = async () => 0;
const mockJingExecFailure = async (
  _command: string,
  _args: string[] | undefined,
  options?: { listeners?: { stdout?: (data: Buffer) => void } }
) => {
  if (options?.listeners?.stdout) {
    options.listeners.stdout(Buffer.from(twoErrorOutput));
  }
  return 1;
};

function setInputs(inputs: Record<string, string>) {
  core.getInput.mockImplementation((name: string) => inputs[name] ?? '');
}

describe('main.ts', () => {
  beforeEach(() => {
    setInputs({ schema: 'dracor', files: 'tei/valid.xml' });
    core.summary.stringify.mockImplementation(() => '<summary>');
    exec.exec.mockImplementation(mockJingExecSuccess);
    validate.mockResolvedValue([]);
    delete process.env.GITHUB_STEP_SUMMARY;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('runs with successful jing validation', async () => {
    await run();
    expect(exec.exec).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('runs with jing validation errors and fails the action', async () => {
    exec.exec.mockImplementation(mockJingExecFailure);
    await run();
    expect(core.summary.addTable).toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith('Invalid documents');
  });

  it('uses the TEI schema when schema=tei and skips schematron', async () => {
    setInputs({ schema: 'tei', version: '4.9.0', files: 'tei/valid.xml' });
    await run();
    const [, args] = exec.exec.mock.calls[0];
    expect(args?.[0]).toMatch(/tei_all_4\.9\.0\.rng$/);
    expect(validate).not.toHaveBeenCalled();
  });

  it('fails with a clear message on unknown schema', async () => {
    setInputs({ schema: 'bogus', files: 'tei/valid.xml' });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith('Unknown schema "bogus"');
    expect(exec.exec).not.toHaveBeenCalled();
  });

  it('does not fail the action when warn-only is set', async () => {
    setInputs({
      schema: 'dracor',
      files: 'tei/valid.xml',
      'warn-only': 'yes',
    });
    exec.exec.mockImplementation(mockJingExecFailure);
    await run();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('reports no files found when the input resolves to nothing', async () => {
    setInputs({ schema: 'dracor', files: '' });
    await run();
    expect(exec.exec).not.toHaveBeenCalled();
    expect(core.summary.addRaw).toHaveBeenCalledWith(
      expect.stringMatching(/No files found/)
    );
  });

  it('writes the summary when GITHUB_STEP_SUMMARY is set', async () => {
    process.env.GITHUB_STEP_SUMMARY = '/tmp/summary.md';
    try {
      await run();
      expect(core.summary.write).toHaveBeenCalled();
    } finally {
      delete process.env.GITHUB_STEP_SUMMARY;
    }
  });

  it('adds schematron warnings and errors to the summary table, skipping information', async () => {
    validate.mockResolvedValue([
      {
        document: 'tei/valid.xml',
        role: 'warning',
        text: 'warn msg',
        lineNumber: 3,
        columnNumber: 4,
      },
      {
        document: 'tei/valid.xml',
        role: '',
        text: 'error msg',
        lineNumber: 5,
        columnNumber: 6,
      },
      {
        document: 'tei/valid.xml',
        role: 'information',
        text: 'info msg',
        lineNumber: 7,
        columnNumber: 8,
      },
    ]);
    await run();
    expect(core.summary.addTable).toHaveBeenCalled();
    const table = core.summary.addTable.mock.calls[0][0];
    // header row + warning + error rows (info skipped)
    expect(table).toHaveLength(3);
    // errors present, so action fails
    expect(core.setFailed).toHaveBeenCalledWith('Invalid documents');
  });
});
