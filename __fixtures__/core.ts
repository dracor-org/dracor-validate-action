import type * as core from '@actions/core';
import { vi } from 'vitest';

export const debug = vi.fn<typeof core.debug>();
export const error = vi.fn<typeof core.error>();
export const info = vi.fn<typeof core.info>();
export const isDebug = vi.fn<typeof core.isDebug>();
export const getInput = vi.fn<typeof core.getInput>();
export const setOutput = vi.fn<typeof core.setOutput>();
export const setFailed = vi.fn<typeof core.setFailed>();
export const warning = vi.fn<typeof core.warning>();
export const summary = {
  addHeading: vi.fn<typeof core.summary.addHeading>(),
  addRaw: vi.fn<typeof core.summary.addRaw>(),
  addBreak: vi.fn<typeof core.summary.addBreak>(),
  addList: vi.fn<typeof core.summary.addList>(),
  addTable: vi.fn<typeof core.summary.addTable>(),
  stringify: vi.fn<typeof core.summary.stringify>(),
  write: vi.fn<typeof core.summary.write>(),
};
