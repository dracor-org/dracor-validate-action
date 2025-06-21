import type * as core from '@actions/core';
import { jest } from '@jest/globals';

export const debug = jest.fn<typeof core.debug>();
export const error = jest.fn<typeof core.error>();
export const info = jest.fn<typeof core.info>();
export const isDebug = jest.fn<typeof core.isDebug>();
export const getInput = jest.fn<typeof core.getInput>();
export const setOutput = jest.fn<typeof core.setOutput>();
export const setFailed = jest.fn<typeof core.setFailed>();
export const warning = jest.fn<typeof core.warning>();
export const summary = {
  addHeading: jest.fn<typeof core.summary.addHeading>(),
  addRaw: jest.fn<typeof core.summary.addRaw>(),
  addBreak: jest.fn<typeof core.summary.addBreak>(),
  stringify: jest.fn<typeof core.summary.stringify>(),
  write: jest.fn<typeof core.summary.write>(),
};
