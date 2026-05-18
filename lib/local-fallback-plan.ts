/**
 * Client or router fallback when route-intent fails or returns a shallow plan.
 * Avoids single-step "echo user message" plans that produce poor codegen UX.
 */
export type LocalFallbackPlan = {
  title: string;
  summary: string;
  steps: string[];
  filesToTouch: string[];
  isInitialBuild: boolean;
};

/** True when steps are too thin (e.g. one step that only repeats the prompt). */
export function isShallowUserEchoPlan(prompt: string, steps: string[]): boolean {
  const p = prompt.trim().toLowerCase();
  if (steps.length === 0) return true;
  if (steps.length >= 5) return false;

  const normalized = steps.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 1) {
    const only = normalized[0];
    if (only === p) return true;
    if (only.length < 20 && p.includes(only)) return true;
    if (p.includes(only) && only.length > 8 && Math.abs(only.length - p.length) < 6) return true;
  }

  if (normalized.length <= 2) {
    const merged = normalized.join(' ');
    if (merged === p || (merged.length < 40 && p.startsWith(merged))) return true;
  }

  return false;
}

export function buildLocalFallbackPlan(
  message: string,
  isInitialBuild: boolean,
): LocalFallbackPlan {
  const title = message.trim().slice(0, 80) || 'Төлөвлөгөө';

  if (isInitialBuild) {
    const isTimer = /pomodoro|помодоро|помодор|таймер|timer|countdown|цаг/i.test(message);

    const steps = isTimer
      ? [
          'src/App.tsx дээр Pomodoro UI: үлдсэн цаг (mm:ss), одоогийн горим (ажил/амралт).',
          'useState + useEffect (эсвэл useRef): секунд тэгш тоолох, пауз, дахин эхлүүлэх.',
          'Дэлгэц дээр Start / Pause / Reset товч, стандарт 25/5 мин загвар (тохируулж болно).',
          'Таймер дуусахад товч мэдэгдэл эсвэл визуал дохио (optional, энгийн).',
          'Зөвхөн Tailwind utility класс ашиглах; шинэ *.css файл бүү үүсгэ (зөвхөн одоогийн index.css).',
          'src/main.tsx → App импорт зөв, бүх JSX бүрэн, Vite preview анхнаасаа ажиллана.',
        ]
      : [
          'Оролтын шаардлагыг src/App.tsx болон шаардлагатай src/components/ файлд задлан хэрэгжүүлэх.',
          'src/main.tsx оролт, одоогийн Vite react-ts бүтцийг хадгалах.',
          'UI-г зөвхөн Tailwind utility-аар (layout, товчнууд, responsive).',
          'State болон event-уудыг React hook-оор тодорхой, уншигдахуйц бичих.',
          'Шинэ компонент бол тусад нь файл үүсгэж App-д импортлох.',
          'Файл бүрийг бүрэн агуулгаар гаргах, импорт/синтакс алдаагүй байлгах.',
        ];

    return {
      title,
      summary:
        'Анхны Vite + React + TypeScript төсөл дээр таны тайлбарт нийцсэн аппыг олон алхмаар бүтээж, гол логикийг App/компонентод төвлөрүүлнэ.',
      steps,
      filesToTouch: ['src/App.tsx', 'src/main.tsx'],
      isInitialBuild: true,
    };
  }

  return {
    title,
    summary: 'Одоо байгаа кодыг зөвхөн шаардлагатай хэмжээгээр өөрчилнө.',
    steps: [
      `Хүсэлтийг файлуудтай харьцуулан хамгийн тохирох газарт тусгана: ${message.slice(0, 180)}`,
      'Өөрчлөлтийг хамгийн бага хүрээтэй хийнэ (нэг дор бүхнийг дахин бичихгүй).',
      'Одоогийн импорт, path, Tailwind хэв маягийг хадгална.',
    ],
    filesToTouch: [],
    isInitialBuild: false,
  };
}
