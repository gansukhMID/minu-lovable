# Web Builder Platform

Энэ repo нь open-lovable-н fork / өргөрөг платформ.
Зорилго: Монгол бизнес эрхлэгчдэд зориулсан web builder platform.

## Архитектур
PLATFORM.md файлыг уншина уу.

## Sandbox
Одоогоор хэвээр үлдээнэ — өөрчлөхгүй.
**Agent / codegen:** Minu sandbox үүсгэхдээ **Vite + React + TypeScript** (`react-ts`) төслөөр гарна — шинэ компонент эхлээд **`.tsx`**, суурьтай нь **`src/App.tsx`** / **`src/main.tsx`** гэж үзэж болно (`generate-ai-code-stream` system prompt-д тодорхой заагдсан).

## Гол өөрчлөлтүүд
- modules/ folder нэмэх  
- generate-ai-code-stream → module assembler болгох
- HomePage → business onboarding болгох
