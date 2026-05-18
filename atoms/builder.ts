import { atom } from 'jotai';

/** Live status text for codegen / apply (ribbon above chat). */
export const streamRibbonAtom = atom<string>('');

/** Recent stream/apply progress lines (chat column “Activity” log). */
export const streamActivityTicksAtom = atom<string[]>([]);
