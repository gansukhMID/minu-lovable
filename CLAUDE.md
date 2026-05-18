# Web Builder Platform

Энэ repo нь open-lovable-н fork / өргөрөг платформ.
Зорилго: Монгол бизнес эрхлэгчдэд зориулсан web builder platform.

## Архитектур
PLATFORM.md файлыг уншина уу.

## Sandbox
Одоогоор хэвээр үлдээнэ — өөрчлөхгүй.
**Minu sandbox** үүсгэхдээ **Vite + React + TypeScript** (\`react-ts\`). Энэ нь **анхдагч Vite react-ts** — **Tailwind / PostCSS суулгаагүй**. Анхны бүтээлд агент **Tailwind v3 + PostCSS** (\`tailwind.config.*\`, \`postcss.config.*\`, \`package.json\` devDependencies, \`src/index.css\` дээр \`@tailwind\`) нэг дор нэмнэ. Шинэ компонент **\`.tsx\`**, суурь **\`src/App.tsx\` / \`src/main.tsx\`**.

## Гол өөрчлөлтүүд
- modules/ folder нэмэх  
- generate-ai-code-stream → module assembler болгох
- HomePage → business onboarding болгох
