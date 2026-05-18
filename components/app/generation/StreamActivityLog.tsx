'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import { streamActivityTicksAtom } from '@/atoms/builder';

export default function StreamActivityLog() {
  const ticks = useAtomValue(streamActivityTicksAtom);
  const setTicks = useSetAtom(streamActivityTicksAtom);
  if (ticks.length === 0) return null;

  return (
    <details className="mx-24 mt-8 mb-0 rounded-lg border border-gray-200 bg-white/80 text-caption text-gray-700">
      <summary className="cursor-pointer px-8 py-6 font-semibold">
        Generation activity ({ticks.length})
      </summary>
      <ul className="max-h-[160px] overflow-y-auto border-t border-gray-100 px-10 py-6 space-y-4 font-mono text-[11px]">
        {ticks.map((t, i) => (
          <li key={i} className="whitespace-pre-wrap break-all">
            {t}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-[11px] text-gray-500 underline px-8 pb-6"
        onClick={() => setTicks([])}
      >
        Clear log
      </button>
    </details>
  );
}
