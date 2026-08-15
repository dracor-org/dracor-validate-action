import type * as actionsExec from '@actions/exec';
import { vi } from 'vitest';

export const exec = vi.fn<typeof actionsExec.exec>();
