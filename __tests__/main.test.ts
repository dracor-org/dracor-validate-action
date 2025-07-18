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

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core);
jest.unstable_mockModule('@actions/exec', () => exec);

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js');

const twoErrorOutput = `/invalid.xml:10:36: error: attribute "foo" not allowed
/invalid.xml:456:78: error: element "bar" not allowed`;

const mockJingExecSuccess = async () => 0;
const mockJingExecFailure = async (command, args, options) => {
  if (options?.listeners?.stdout) {
    options.listeners.stdout(Buffer.from(twoErrorOutput));
  }
  return 1;
};

describe('main.ts', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((input) => {
      return { schema: 'dracor', files: 'tei/valid.xml' }[input] || '';
    });
    core.summary.stringify.mockImplementation(() => '<summary>');

    exec.exec.mockImplementation(mockJingExecSuccess);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('runs with successful jing validation', async () => {
    await run();
    expect(exec.exec).toHaveBeenCalledTimes(2);
  });

  it('runs with jing validation errors', async () => {
    exec.exec.mockImplementation(mockJingExecFailure);
    await run();
    expect(exec.exec).toHaveBeenCalledTimes(2);
  });
});
