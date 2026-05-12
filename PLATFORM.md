# Web Builder Platform — Систем архитектур

> Байгуулга бүрт тусдаа deployment хийгддэг тул tenant isolation шаардлагагүй.  
> Agent болон Preview tool нь **платформын өөрийн UI** — хэрэглэгчийн бүтээсэн web-ээс огт тусдаа.  
> Agent нь хөгжүүлэлтийг **ephemeral container дотор** хийдэг — аюулгүй байдлын үндсэн зарчим.  
> Frontend component-уудыг agent generate хийхгүй — **shadcn/ui** бэлэн component-уудыг ашиглана.

---

## 1. Хоёр тусдаа систем

```
┌─────────────────────────────────┐        ┌──────────────────────────────────┐
│       BUILDER PLATFORM          │        │        CUSTOMER WEB              │
│       platform.mn               │        │        naran.platform.mn         │
│                                 │        │                                  │
│  • Agent chat UI                │──────▶ │  • Сонгосон модулиудын UI        │
│  • Preview tool                 │ deploy │  • Backend API                   │
│  • Config editor                │        │  • Өөрийн PostgreSQL             │
│  • Deploy manager               │        │  • Middleware холболт            │
│                                 │        │                                  │
│  Зөвхөн бүтээх үед ашиглана    │        │  Deploy хийсний дараа бие даана  │
└─────────────────────────────────┘        └──────────────────────────────────┘
         Платформын repo                            Гаралт (artifact)
```

**Гол зарчим:** Deploy хийсний дараа хоёр систем хоорондоо **ямар ч холболтгүй**.

---

## 2. Ерөнхий зарчим

| Зарчим | Тайлбар |
|---|---|
| Platform ≠ Output | Builder UI болон бүтээгдсэн web хоёр тусдаа систем |
| Agent-in-container | Agent бүх хөгжүүлэлтийг ephemeral container дотор хийнэ |
| Per-deployment | Байгуулга бүр өөрийн тусдаа instance, тусдаа database авна |
| Module composition | Нэг deployment дээр хэд хэдэн модуль нэгтгэх боломжтой |
| Agent-driven setup | Хэрэглэгч кодчилол мэдэхгүй — agent яриагаар систем бүтээнэ |
| Pre-built templates | Зөвхөн урьдчилан бэлтгэсэн модулиудыг deploy хийнэ |
| Pre-wired middleware | QR Payment, eMongolia гэх мэт холболтууд урьдчилан бэлдсэн |
| shadcn/ui | Frontend component-уудыг agent generate хийхгүй — shadcn/ui-г ашиглана |

---

## 3. Agent container — аюулгүй байдал

### 3.1 Яагаад container дотор?

Agent нь хэрэглэгчийн хүсэлтээр код бичиж, `npm install` ажиллуулж, build хийнэ. Энэ нь дараах эрсдэлийг агуулна:

- Хортой код ажиллуулах (arbitrary code execution)
- Платформын server-ийн файлд хандах
- Бусад хэрэглэгчдийн мэдээлэлд хандах
- Интернетэд санамсаргүй холбогдох

Container isolation эдгээрийг бүгдийг хаана.

### 3.2 Container-ийн хязгаарлалт

```
┌─────────────────────────────────────────────────────┐
│  Ephemeral agent container                          │
│                                                     │
│  Filesystem:   зөвхөн /workspace  (read-only root) │
│  Network:      whitelist-д байгаа endpoint-үүд л    │
│  CPU:          max 2 core                           │
│  RAM:          max 2GB                              │
│  Disk:         max 5GB (/workspace)                 │
│  Timeout:      max 30 минут                         │
│  User:         root биш — unprivileged user         │
│  Syscall:      seccomp profile-аар хязгаарлана      │
└─────────────────────────────────────────────────────┘
```

### 3.3 Container lifecycle

```
Хэрэглэгч session эхэлнэ
        │
        ▼
[Platform: шинэ container spin up — ~2–5 секунд]
   - Цэвэр image-аас үүснэ (pre-built base image)
   - Өмнөх session-ий мэдээлэл байхгүй
   - Зөвхөн platform modules/ болон shared/ read-only mount
        │
        ▼
[Agent container дотор ажиллана]
   - Хэрэглэгчтэй chat UI-аар харилцана
   - /workspace дотор код бичнэ
   - npm install, build, test ажиллуулна
   - Artifact (Docker image) үүсгэнэ
        │
        ├── Artifact → Registry руу push хийнэ
        ├── Build log → Audit storage руу хадгална
        │
        ▼
[Session дуусах үед container устгагдана]
   - /workspace — бүрэн устна
   - Process — бүгд kill
   - Network state — цэвэрлэгдэнэ
        │
        ▼
Дараагийн session-д шинэ container — ямар ч үлдэгдэл байхгүй
```

**Container-с гарч үлдэх зүйл (container-с гадна):**

| Зүйл | Хадгалах газар | Зорилго |
|---|---|---|
| Docker image (artifact) | Container registry | Customer web deploy хийхэд |
| Build log | Audit storage | Хяналт, debugging |
| instance.config.json | Platform DB | Тохиргоо |

### 3.4 Network whitelist

Container-с зөвхөн доорх endpoint-үүдэд хандах боломжтой:

```
ЗӨВШӨӨРӨГДСӨН:
  registry.npmjs.org      — npm package татах
  api.anthropic.com       — Claude API (agent-ийн тархи)
  artifact-registry.internal — Artifact push хийх
  [тодорхой middleware API] — QR, eMongolia г.м. (config-оос)

ХААСАН:
  * (бусад бүх интернет)
  platform-db.internal    — Платформын database
  *.internal (бусад)      — Дотоод сүлжээ
```

### 3.5 Filesystem isolation

```
Container дотор:
  /workspace/         ← Agent зөвхөн энд бичнэ (read-write)
    ├── src/
    ├── package.json
    └── ...

  /platform/modules/  ← Read-only mount (platform repo-аас)
  /platform/shared/   ← Read-only mount (platform repo-аас)
  /platform/templates/← Read-only mount

  /etc, /usr, /bin    ← Read-only (container image)
  /proc, /sys         ← seccomp-оор хязгаарлагдсан
```

---

## 4. Frontend — shadcn/ui

### 4.1 Яагаад shadcn/ui?

Agent component generate хийх нь найдваргүй — гарах дизайн тасралтгүй өөр, accessibility дутагдалтай, regression гарах магадлал өндөр. shadcn/ui нь:

- **Copy-paste суурьтай** — source code нь `components/ui/` дотор шууд байна, lock-in байхгүй
- **Radix UI дээр суурилсан** — accessibility, keyboard navigation бэлэн
- **Tailwind CSS** — нэг design system, бүх модульд нийцтэй
- **TypeScript native** — type-safe props

### 4.2 Agent-ийн үүрэг frontend-д

Agent component **бичихгүй**, зөвхөн **угсарна**:

```
Agent хийдэг зүйл:
  ✓ shadcn/ui component-уудыг import хийнэ
  ✓ Модулийн хуудсуудыг layout-аар угсарна
  ✓ Backend API-г component-д холбоно (data fetching)
  ✓ instance.config.json-д тохирсон navigation үүсгэнэ
  ✓ Өнгө, брэнд тохиргоог tailwind.config.ts-д тавина

Agent хийхгүй зүйл:
  ✗ Шинэ UI component бичихгүй
  ✗ CSS/HTML дахин бичихгүй
  ✗ shadcn/ui-с гадна component framework ашиглахгүй
```

### 4.3 Модуль бүрийн frontend бүтэц

```
modules/store/components/
  ├── pages/
  │   ├── OrdersPage.tsx        # shadcn/ui Table, Badge, Button ашиглана
  │   ├── NewOrderPage.tsx      # shadcn/ui Form, Input, Select ашиглана
  │   └── PaymentPage.tsx       # shadcn/ui Card, Dialog ашиглана
  └── index.ts                  # Export — module loader ачаалдаг
```

```tsx
// modules/store/components/pages/OrdersPage.tsx
import { DataTable }  from '@/components/ui/data-table'  // shadcn/ui
import { Badge }      from '@/components/ui/badge'        // shadcn/ui
import { Button }     from '@/components/ui/button'       // shadcn/ui
import { useOrders }  from '../hooks/useOrders'           // Module hook

export function OrdersPage() {
  const { orders } = useOrders()
  return (
    <DataTable
      columns={columns}
      data={orders}
      actions={<Button>Захиалга нэмэх</Button>}
    />
  )
}
```

### 4.4 Customer web-ийн UI давхарга

```
apps/customer-web/frontend/
  ├── components/
  │   └── ui/                   # shadcn/ui — npx shadcn@latest add ...
  │       ├── button.tsx
  │       ├── card.tsx
  │       ├── data-table.tsx
  │       ├── dialog.tsx
  │       ├── form.tsx
  │       ├── input.tsx
  │       ├── select.tsx
  │       ├── badge.tsx
  │       └── ...               # Модульд шаардлагатай бүгдийг нэмнэ
  ├── lib/
  │   └── utils.ts              # cn() helper
  ├── tailwind.config.ts        # Брэнд өнгө, font — agent тохируулна
  └── app/
      ├── layout.tsx            # Navigation — config-оос үүснэ
      └── (modules)/            # Модуль бүрийн хуудсууд
          ├── store/
          ├── warehouse/
          └── ...
```

### 4.5 Брэнд тохиргоо

Agent хэрэглэгчтэй ярилцаж `tailwind.config.ts`-д өнгө тохируулна — shadcn/ui CSS variable-уудыг override хийдэг тул бүх component автоматаар өөрчлөгдөнө:

```typescript
// tailwind.config.ts — agent үүсгэнэ
export default {
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1a56db', foreground: '#ffffff' },
        // ... хэрэглэгчийн брэндийн өнгө
      },
    },
  },
}
```

### 4.6 Шаардлагатай shadcn/ui component-үүд (модуль тус бүр)

| Модуль | Ашиглах component-үүд |
|---|---|
| Store | `data-table`, `form`, `input`, `select`, `badge`, `dialog`, `card` |
| Warehouse | `data-table`, `badge`, `progress`, `alert`, `card` |
| CRM | `data-table`, `avatar`, `card`, `tabs`, `badge` |
| ERP | `data-table`, `chart` (recharts), `card`, `tabs`, `date-picker` |
| Нийтлэг | `button`, `navigation-menu`, `sidebar`, `toast`, `dropdown-menu` |

---

## 5. Repo бүтэц

```
platform/
│
├── apps/
│   ├── builder/                  # ← ПЛАТФОРМЫН UI
│   │   ├── agent/                #   AI яриа, шаардлага цуглуулах
│   │   ├── preview/              #   Урьдчилан харах
│   │   ├── config-editor/        #   Модуль, middleware тохиргоо
│   │   └── deploy-manager/       #   Instance үүсгэх, байршуулах
│   │
│   └── customer-web/             # ← CUSTOMER WEB TEMPLATE (гаралт)
│       ├── frontend/
│       │   ├── components/ui/    #   shadcn/ui component-үүд
│       │   ├── tailwind.config.ts#   Брэнд өнгө
│       │   └── app/              #   Модулиудын хуудсууд
│       ├── backend/
│       └── Dockerfile
│
├── modules/                      # ← МОДУЛИУД (container дотор read-only mount)
│   ├── store/
│   ├── warehouse/
│   ├── crm/
│   └── erp/
│
├── shared/                       # ← НИЙТЛЭГ ДАВХАРГА
│   ├── auth/
│   ├── db/
│   ├── event-bus/
│   ├── storage/
│   └── middleware/
│       ├── qr-payment/
│       ├── emongolia/
│       ├── einvoice/
│       └── sms-otp/
│
├── container/                    # ← AGENT CONTAINER DEFINITION
│   ├── Dockerfile.agent          #   Base image
│   ├── seccomp-profile.json      #   Syscall хязгаарлалт
│   ├── network-policy.yaml       #   Network whitelist
│   └── resource-limits.yaml      #   CPU/RAM/disk
│
└── templates/
    ├── store.config.json
    ├── warehouse.config.json
    ├── crm.config.json
    └── erp.config.json
```

---

## 5. Builder platform — дотоод бүтэц

### 5.1 Agent

```
Хэрэглэгч ярилцана (chat UI)
        │
        ▼
[Container manager: ephemeral container spin up]
        │
        ▼
[Agent container дотор:]
   - Бизнесийн төрлийг ойлгоно
   - Модулиудыг санал болгоно
   - Middleware хэрэгцээ тодорхойлно
   - instance.config.json үүсгэнэ
   - modules/ + shared/ -аас customer-web build хийнэ
   - Artifact гаргана
        │
        ▼
[Artifact → deploy pipeline]
        │
        ▼
[Container destroy]
```

### 5.2 Preview tool

```
instance.config.json
        │
        ▼
[Preview renderer — container-аас тусдаа, аюулгүй sandbox]
   - Сонгосон модулиудын navigation үүсгэнэ
   - Жишээ өгөгдлөөр дүүргэнэ
   - Iframe дотор харуулна
        │
        ▼
Хэрэглэгч харж, agent-тай ярилцан өөрчилнө
```

### 5.3 Deploy manager

```typescript
// apps/builder/deploy-manager/index.ts
async function deployInstance(config: InstanceConfig) {
  // Artifact registry-аас татна (container-д build хийгдсэн)
  const image = await registry.pull(config.instanceId)

  // Subdomain тохируулна
  await dns.createSubdomain(config.domain)

  // Container ажиллуулна
  await orchestrator.run({
    image,
    domain: config.domain,
    env: buildEnvFromConfig(config),
  })

  return { url: `https://${config.domain}` }
}
```

---

## 6. Customer web — дотоод бүтэц

Deploy хийгдсэний дараа **платформаас бүрэн тусдаа** ажиллана.

### 6.1 Instance config

```json
{
  "instanceId": "naranbistro-001",
  "domain": "naran.platform.mn",
  "modules": ["store", "warehouse"],
  "middleware": {
    "qr-payment": {
      "provider": "khan-bank",
      "merchantId": "MN-12345"
    }
  },
  "auth": {
    "roles": ["cashier", "manager"]
  }
}
```

### 6.2 Module loader — startup

```typescript
async function bootstrap() {
  const config = loadConfig('instance.config.json')

  for (const name of config.modules) {
    const mod = await import(`@platform/modules/${name}`)
    await mod.runMigrations()
    await mod.registerRoutes()
    await mod.registerEvents()
  }
}
```

### 6.3 Модулиудын харилцаа — Event bus

```
Store  →  publish("order.created", { items, customer, total })
                        │
                  Event Bus
                  ┌────────────────────────────────┐
                  │  Warehouse  ← нөөц хасна        │
                  │  CRM        ← харилцагч бүртгэнэ │
                  │  ERP        ← орлого бүртгэнэ    │
                  └────────────────────────────────┘
```

| Event | Гаргагч | Сонсогч |
|---|---|---|
| `order.created` | Store | Warehouse, CRM, ERP |
| `stock.low` | Warehouse | Store, ERP |
| `customer.created` | CRM | ERP |
| `payment.received` | Store | ERP |
| `invoice.issued` | ERP | Store, CRM |

---

## 7. Модулийн бүтэц

```typescript
export interface Module {
  name: string
  version: string
  routes: Router
  components: Component[]
  schema: string
  events: {
    publishes: EventType[]
    subscribes: EventType[]
  }
  middlewareNeeds: string[]
}
```

---

## 8. Middleware adapter бүтэц

```typescript
export interface QRPaymentAdapter {
  createPayment(amount: number): Promise<PaymentIntent>
  checkStatus(paymentId: string): Promise<PaymentStatus>
  refund(paymentId: string): Promise<void>
}

export class KhanBankAdapter implements QRPaymentAdapter { ... }
export class GolomtAdapter   implements QRPaymentAdapter { ... }
```

| Middleware | Provider | Статус |
|---|---|---|
| `qr-payment` | Хаан банк, Голомт | Бэлэн |
| `emongolia` | eMongolia API v2 | Бэлэн |
| `einvoice` | НӨАТ e-баримт | Бэлэн |
| `sms-otp` | Unitel, MobiCom | Бэлэн |
| `storage` | S3-compatible | Бэлэн |

---

## 9. Tech stack

| Давхарга | Builder platform | Agent container | Customer web |
|---|---|---|---|
| Frontend | React + Vite | — | React + Vite |
| UI component | shadcn/ui | — | shadcn/ui |
| Styling | Tailwind CSS | — | Tailwind CSS |
| Backend | Node.js + Hono | Node.js | Node.js + Hono |
| Database | — | — | PostgreSQL |
| Event bus | — | — | Redis pub/sub |
| Container | — | Docker (ephemeral) | Docker |
| Isolation | — | seccomp + network policy | — |
| Storage | — | /workspace (temp) | MinIO (S3) |
| AI | Claude API | Claude API | — |

---

## 10. Agent — дотоод бүтэц ба tool-ууд

### 10.1 Reasoning loop

Agent нь tool call бүрийн дараа reasoning loop-д буцаж ордог:

```
Conversation state (бүх мессеж, tool result, context)
        │
        ▼
┌─────────────────────────────────────────┐
│  Reasoning loop  ↻                      │
│                                         │
│  1. Think  →  Claude API дуудна         │
│              Дараагийн алхам шийднэ     │
│                                         │
│  2. Tool сонгох  →  Аль tool дуудах     │
│                    Параметр бэлтгэх     │
│                                         │
│  3. Execute  →  Tool ажиллуулна         │
│                Result-ийг state-д нэмнэ │
│                → 1-рүү буцна            │
└─────────────────────────────────────────┘
        │  (tool шаардлагагүй болоход гарна)
        ▼
   Chat хариу / Deploy / Дуусгах
```

**Зарчим:** Agent tool-ийн result-ийг conversation state-д нэмж, дахин Think хийж дараагийн алхмаа шийднэ. Хэрэглэгчтэй харилцах (`chat_*`), deploy хийх (`deploy_push`) — бүгд tool-оор дамжина.

### 10.2 Tool-уудын жагсаалт

#### Filesystem tools
> `/workspace` дотор — container-с гадна хандах эрхгүй

| Tool | Signature | Тайлбар |
|---|---|---|
| `fs_read` | `(path) → string` | Файл унших. `/workspace` болон `/platform` read-only mount. |
| `fs_write` | `(path, content) → void` | Файл бичих. Зөвхөн `/workspace` — бусад path блоклогдоно. |
| `fs_list` | `(path) → string[]` | Directory жагсаах. |
| `fs_delete` | `(path) → void` | Файл устгах. Зөвхөн `/workspace`. |
| `fs_patch` | `(path, diff) → void` | Unified diff-ээр файлын тодорхой хэсгийг өөрчлөх. |
| `shell_exec` | `(cmd, cwd?) → {stdout, stderr, code}` | Shell команд ажиллуулах. Whitelist-д байгаа команд л зөвшөөрөгдөнө. |

#### Config tools
> `instance.config.json` удирдах

| Tool | Signature | Тайлбар |
|---|---|---|
| `config_read` | `() → InstanceConfig` | Одоогийн config унших. |
| `config_set_modules` | `(modules: string[]) → void` | Идэвхтэй модулиудыг тохируулах. Зөвхөн урьдчилан бэлтгэсэн нэр зөвшөөрөгдөнө. |
| `config_set_middleware` | `(key, cfg) → void` | Middleware тохиргоо тавих. QR, eMongolia г.м. |
| `config_set_roles` | `(roles: string[]) → void` | Хэрэглэгчийн эрх, үүрэг тохируулах. |
| `config_set_theme` | `(theme: ThemeConfig) → void` | Брэнд өнгө, font тохиргоо. `tailwind.config.ts`-д тусгагдана. |
| `config_validate` | `() → {valid, errors}` | Config-ийн бүрэн бүтэн байдлыг шалгах. |

#### Build tools
> npm, TypeScript, test — container дотор

| Tool | Signature | Тайлбар |
|---|---|---|
| `build_install` | `() → {success, log}` | `npm install` ажиллуулах. Зөвхөн whitelisted registry. |
| `build_compile` | `() → {success, errors, warnings}` | TypeScript compile, Vite build. |
| `build_test` | `(pattern?) → TestResult` | Unit test ажиллуулах. Fail бол deploy блоклогдоно. |
| `build_migrate` | `() → {success, applied}` | Сонгосон модулиудын SQL schema migration бэлтгэх. |

#### Preview tools
> Shared state-аар preview renderer-тэй харилцана

| Tool | Signature | Тайлбар |
|---|---|---|
| `preview_refresh` | `() → void` | Preview renderer-т шинэ config илгээх. Хэрэглэгч шууд харна. |
| `preview_set_page` | `(module, page) → void` | Preview-д харуулах хуудсыг сонгох. |
| `preview_set_data` | `(data) → void` | Preview-д харуулах жишээ өгөгдөл тохируулах. |
| `preview_screenshot` | `() → base64` | Preview-ийн snapshot авах. Log болон баталгаажуулалтад. |

#### Chat tools
> Хэрэглэгчтэй харилцах — reasoning loop-с гарж хариу хүлээнэ

| Tool | Signature | Тайлбар |
|---|---|---|
| `chat_ask` | `(question) → string` | Нээлттэй асуулт асуух. Хэрэглэгчийн хариу ирэх хүртэл хүлээнэ. |
| `chat_choose` | `(q, options) → string` | Chip хэлбэрийн сонголт харуулна. Хэрэглэгч нэгийг дарна. |
| `chat_confirm` | `(message) → boolean` | Тийм/Үгүй баталгаажуулалт. `deploy_push` өмнө заавал дуудна. |
| `chat_inform` | `(message, level?) → void` | Мэдэгдэл илгээх. Хариу хүлээхгүй. `info \| warning \| error`. |

#### Deploy tools
> `chat_confirm` баталгаажсаны дараа л дуудаж болно

| Tool | Signature | Тайлбар |
|---|---|---|
| `deploy_push` | `() → {url, instanceId}` | Docker image build → registry push → subdomain deploy. |
| `deploy_status` | `(instanceId) → DeployStatus` | Deploy-ийн явцыг шалгах. `pending \| running \| done \| failed`. |

#### Guard tools
> Аюулгүй байдлын хяналт — agent reasoning-ийн эхэнд өөрөө дуудна

| Tool | Signature | Тайлбар |
|---|---|---|
| `guard_check_module` | `(name) → {allowed, reason?}` | Модулийн нэр бэлтгэсэн жагсаалтад байгаа эсэхийг шалгана. |
| `guard_check_path` | `(path) → {allowed}` | Файлын зам `/workspace` хязгаарт байгаа эсэхийг шалгана. |
| `guard_check_network` | `(url) → {allowed}` | URL network whitelist-д байгаа эсэхийг шалгана. |
| `guard_audit_log` | `(action, meta) → void` | Бүх tool call-ийг audit storage-д бүртгэх. |

### 10.3 Tool дуудах дараалал (жишээ)

```
1. guard_check_module("store")          ← Модуль зөвшөөрөгдсөн эсэх
2. config_set_modules(["store","warehouse"])
3. config_set_middleware("qr-payment", {...})
4. config_validate()                    ← Config зөв эсэх
5. preview_refresh()                    ← Хэрэглэгч харна
6. chat_ask("Өнгө тохиргоо хийх үү?")
7. config_set_theme({primary:"#1a56db"})
8. preview_refresh()
9. build_install()
10. build_compile()
11. build_test()
12. chat_confirm("Deploy хийх үү?")    ← Заавал
13. deploy_push()                       ← Баталгаажсаны дараа
14. guard_audit_log("deploy", {...})
```

---

## 11. Шинэ модуль нэмэх дүрэм

1. `modules/[name]/` folder үүсгэнэ
2. `Module` interface биелүүлнэ
3. `schema.sql` migration бичнэ
4. `events.ts`-д publish/subscribe зарлана
5. `components/pages/` дотор shadcn/ui ашиглан хуудсуудыг бичнэ
6. `templates/[name].config.json` шаардлага бичнэ — шаардлагатай shadcn/ui component-үүдийг жагсаана
7. Agent-ийн санал болгох логикт нэмнэ
8. Container network whitelist-д шаардлагатай endpoint нэмнэ

> Бусад модулийн кодыг **огт өөрчлөхгүй** — event-bus-аар л холбогдоно.

---

*Сүүлд шинэчлэгдсэн: 2026-05-12 — agent бүтэц, tool жагсаалт нэмэгдлээ*
