'use client';

export type PlanCardStatus = 'streaming' | 'executing' | 'done' | 'error';

export type PlanCardData = {
  title: string;
  summary: string;
  steps: string[];
  filesToTouch: string[];
  status: PlanCardStatus;
  /** Set when router classifies greenfield build (optional in UI) */
  isInitialBuild?: boolean;
};

type Props = {
  plan: PlanCardData;
  alignRight?: boolean;
};

const statusLabel: Record<PlanCardStatus, string> = {
  streaming: 'Planning',
  executing: 'Building',
  done: 'Done',
  error: 'Error',
};

const statusClass: Record<PlanCardStatus, string> = {
  streaming: 'bg-amber-100 text-amber-900 border-amber-200',
  executing: 'bg-blue-100 text-blue-900 border-blue-200',
  done: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  error: 'bg-red-100 text-red-900 border-red-200',
};

export default function PlanCard({ plan, alignRight }: Props) {
  return (
    <div className={`mt-8 max-w-[min(100%,42rem)] text-xs ${alignRight ? 'ml-auto' : 'mr-auto'}`}>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-8 py-6 border-b border-gray-100 bg-gray-50">
          <div className="font-semibold text-gray-900 text-sm">Plan</div>
          <span
            className={`shrink-0 text-[10px] uppercase tracking-wide px-8 py-2 rounded-full border ${statusClass[plan.status]}`}
          >
            {statusLabel[plan.status]}
          </span>
        </div>
        <div className="px-8 py-6 space-y-8 text-gray-800">
          <div>
            <div className="text-sm font-semibold text-gray-900">{plan.title}</div>
            {plan.summary ? (
              <p className="mt-4 text-xs leading-relaxed text-gray-600 whitespace-pre-wrap">
                {plan.summary}
              </p>
            ) : null}
          </div>
          {plan.steps.length > 0 ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-4">
                Steps
              </div>
              <ol className="list-decimal pl-16 space-y-4 text-xs leading-relaxed">
                {plan.steps.map((s, i) => (
                  <li key={i} className="pl-2">
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {plan.filesToTouch.length > 0 ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-4">
                Likely files
              </div>
              <div className="flex flex-wrap gap-4">
                {plan.filesToTouch.map((f) => (
                  <span
                    key={f}
                    className="rounded-md bg-gray-100 border border-gray-200 px-6 py-2 font-mono text-[11px]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
