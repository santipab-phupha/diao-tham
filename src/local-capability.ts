import { messageLanguages } from './message-languages';

export type LocalAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' | 'error';
export type LocalCapabilityReason = 'insecure-context' | 'missing-api' | 'unsupported-options' | 'check-failed' | 'check-timeout' | 'unexpected-result';

const CAPABILITY_TIMEOUT_MS = 8_000;

export interface LocalCapability {
  status: LocalAvailability;
  /** Languages used for this check; no message text is sent to the browser API. */
  languages: string[];
  reason?: LocalCapabilityReason;
}

interface LanguageOptions {
  expectedInputs: Array<{ type: 'text'; languages: string[] }>;
  expectedOutputs: Array<{ type: 'text'; languages: string[] }>;
}

export interface LocalCapabilityEnvironment {
  isSecureContext: boolean;
  languageModel?: { availability(options: LanguageOptions): Promise<unknown> };
}

/**
 * Checks the browser's on-device model without starting a model download,
 * creating a session, requesting permissions, or sending a message to a server.
 * Pass representative message text so this checks the same language options
 * Firebase uses for extraction. Availability is a preliminary check, not proof
 * that a later extraction or Firebase App Check will succeed.
 */
export async function checkLocalCapability(
  sampleText: string,
  environment?: LocalCapabilityEnvironment,
): Promise<LocalCapability> {
  const languages = messageLanguages(sampleText);
  const browser = globalThis as typeof globalThis & {
    LanguageModel?: LocalCapabilityEnvironment['languageModel'];
  };
  const context = environment ?? {
    isSecureContext: browser.isSecureContext === true,
    languageModel: browser.LanguageModel,
  };
  if (!context.isSecureContext) return { status: 'unsupported', languages, reason: 'insecure-context' };
  if (!context.languageModel || typeof context.languageModel.availability !== 'function') {
    return { status: 'unsupported', languages, reason: 'missing-api' };
  }
  const timeoutResult = Symbol('local-capability-timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      context.languageModel.availability({
        expectedInputs: [{ type: 'text', languages }],
        expectedOutputs: [{ type: 'text', languages }],
      }),
      new Promise<typeof timeoutResult>(resolve => {
        timer = setTimeout(() => resolve(timeoutResult), CAPABILITY_TIMEOUT_MS);
      }),
    ]);
    if (result === timeoutResult) return { status: 'error', languages, reason: 'check-timeout' };
    if (result === 'available' || result === 'downloadable' || result === 'downloading' || result === 'unavailable') {
      return { status: result, languages };
    }
    return { status: 'error', languages, reason: 'unexpected-result' };
  } catch (error) {
    const unsupported = error instanceof Error && error.name === 'NotSupportedError';
    return { status: unsupported ? 'unsupported' : 'error', languages, reason: unsupported ? 'unsupported-options' : 'check-failed' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
