import type { ReactNode } from 'react';

type Props = {
  moduleAssembly?: ReactNode;
  chatColumn: ReactNode;
  previewColumn: ReactNode;
};

/**
 * Main builder split: optional module rail + chat + preview.
 */
export default function GenerationWorkbenchLayout({
  moduleAssembly,
  chatColumn,
  previewColumn,
}: Props) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {moduleAssembly}
      {chatColumn}
      {previewColumn}
    </div>
  );
}
