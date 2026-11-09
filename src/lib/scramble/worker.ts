/// <reference lib="webworker" />
import { generate } from './generate';
import { runTool } from '../tools/blocks';
import { caseScramble } from '../trainer/setup';

type Req = { id: number; kind: string; payload: any };

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, kind, payload } = e.data;
  try {
    let result: unknown;
    switch (kind) {
      case 'scramble':
        result = Array.from({ length: payload.count ?? 1 }, () => generate(payload.event, payload.type));
        break;
      case 'warm':
        generate(payload.event, payload.type);
        result = true;
        break;
      case 'tool':
        result = runTool(payload.tool, payload.scramble, payload.options);
        break;
      case 'case':
        result = caseScramble(payload.state, payload.options);
        break;
      default:
        throw new Error('unknown request ' + kind);
    }
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
