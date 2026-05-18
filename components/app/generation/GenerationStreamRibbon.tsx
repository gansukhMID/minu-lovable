'use client';

import { useAtomValue } from 'jotai';
import { streamRibbonAtom } from '@/atoms/builder';

export default function GenerationStreamRibbon() {
  const text = useAtomValue(streamRibbonAtom);
  if (!text.trim()) return null;
  return (
    <div className="border-b border-gray-200 bg-amber-50 px-14 py-6 text-caption text-gray-800">
      <span className="font-semibold text-amber-900">● </span>
      {text}
    </div>
  );
}
