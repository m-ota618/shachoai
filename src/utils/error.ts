// src/utils/error.ts
import { isApiError, formatApiError } from './isApiError';
import { showToast } from '../ui/toast';

export function showApiError(e: unknown, label?: string) {
  if (isApiError(e)) {
    showToast(formatApiError(e, label));
  } else if (e instanceof Error) {
    showToast(`${label ? label + ': ' : ''}${e.message}`);
  } else {
    showToast(`${label ? label + ': ' : ''}${String(e)}`);
  }
}
