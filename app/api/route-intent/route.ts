import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { appConfig } from '@/config/app.config';
import { buildLocalFallbackPlan, isShallowUserEchoPlan } from '@/lib/local-fallback-plan';

export const dynamic = 'force-dynamic';

const isUsingAIGateway = !!process.env.AI_GATEWAY_API_KEY;
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';

const groq = createGroq({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GROQ_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
});

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : process.env.OPENAI_BASE_URL,
});

const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GEMINI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const planSchema = z.object({
  title: z.string().describe('Short title for the plan card'),
  summary: z.string().describe('1–3 sentences what will change'),
  steps: z.array(z.string()).min(1).max(12).describe('Ordered implementation steps'),
  filesToTouch: z.array(z.string()).describe('Likely file paths (hints; may be empty if unknown)'),
  isInitialBuild: z
    .boolean()
    .describe('True when there is no project / no sandbox files yet (greenfield build)'),
});

const routeIntentSchema = z.object({
  intent: z.enum(['chat', 'plan_and_edit']),
  chatResponse: z
    .string()
    .optional()
    .describe('When intent=chat: helpful reply in the same language as the user; no code blocks for app files'),
  plan: planSchema.optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = String(body.prompt || '').trim();
    const isEdit = Boolean(body.isEdit);
    const hasFiles = Boolean(body.hasFiles);
    const recentFiles: string[] = Array.isArray(body.recentFiles)
      ? body.recentFiles.slice(0, 40).map((f: unknown) => String(f))
      : [];
    const recentMessages: Array<{ role?: string; content?: string }> = Array.isArray(body.recentMessages)
      ? body.recentMessages.slice(-8)
      : [];
    const model = (body.model as string) || appConfig.ai.routerModel;

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const recentSnippet = recentMessages
      .map((m) => `${m.role || 'user'}: ${(m.content || '').slice(0, 200)}`)
      .join('\n');

    const fileSnippet =
      recentFiles.length > 0 ? recentFiles.map((p) => `- ${p}`).join('\n') : '(no file list yet)';

    let aiModel;
    if (model.startsWith('anthropic/')) {
      aiModel = anthropic(model.replace('anthropic/', ''));
    } else if (model.startsWith('openai/')) {
      if (model.includes('gpt-oss')) {
        aiModel = groq(model);
      } else {
        aiModel = openai(model.replace('openai/', ''));
      }
    } else if (model.startsWith('google/')) {
      aiModel = googleGenerativeAI(model.replace('google/', ''));
    } else {
      aiModel = groq(model);
    }

    const result = await generateObject({
      model: aiModel,
      schema: routeIntentSchema,
      temperature: 0.2,
      maxOutputTokens: appConfig.ai.routerMaxTokens,
      messages: [
        {
          role: 'system',
          content: `You route user messages for a Vite + React + TypeScript web builder assistant.

Return JSON only (schema enforced).

Rules:
1) If hasFiles=false (no sandbox files / new project), you MUST return intent "plan_and_edit" with isInitialBuild=true and a concrete build plan. Never classify as pure "chat" when the user is clearly asking to create/build an app and there are no files yet — except pure meta questions like "what is React".
2) Use intent "chat" for: explanations, definitions, "what does X mean", how-to without editing their project, clarifying questions, small talk, when they are NOT asking to change their codebase.
3) Use intent "plan_and_edit" when they want any code/feature/UI change, fix, refactor, add/remove components, styling edits, dependencies, etc.
4) Mongolian or English user text: reply in the same language for chatResponse; plan text can match the user language.
5) For plan_and_edit: no code blocks. steps MUST be 4–8 concrete engineering actions for NEW apps (hasFiles=false). NEVER return a "plan" that is only one step repeating the user's sentence.
6) filesToTouch: always include at least src/App.tsx for new builds; add src/components/… when you suggest new components.
7) Special: "check packages"/"npm install" only — plan_and_edit with one step is ok (frontend may short-circuit).

Context:
- isEdit (project already touched): ${isEdit}
- hasFiles: ${hasFiles}

Recent messages (truncated):
${recentSnippet || '(none)'}

Known paths (hints):
${fileSnippet}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    let { intent, chatResponse, plan } = result.object;

    if (intent === 'chat' && (!chatResponse || !chatResponse.trim())) {
      chatResponse = 'Товчхон: асуултад шууд хариулъя. (Дахин бичнэ үү?)';
    }

    if (intent === 'plan_and_edit') {
      if (!plan) {
        const fb = buildLocalFallbackPlan(prompt, !hasFiles);
        plan = {
          title: fb.title,
          summary: fb.summary,
          steps: fb.steps,
          filesToTouch: fb.filesToTouch,
          isInitialBuild: fb.isInitialBuild,
        };
      } else if (!hasFiles) {
        plan = { ...plan, isInitialBuild: true };
      }
    }

    if (intent === 'chat' && !hasFiles) {
      const buildish =
        /\b(хий|бүтээ|үүсгэ|үлдээ|uusge|ulsge|вэб|веб|генерац|landing|website|апп|app|build|create|generate|scaffold)\b/i.test(
          prompt,
        );
      if (buildish) {
        intent = 'plan_and_edit';
        const fb = buildLocalFallbackPlan(prompt, true);
        plan = {
          title: fb.title,
          summary: fb.summary,
          steps: fb.steps,
          filesToTouch: fb.filesToTouch,
          isInitialBuild: true,
        };
        chatResponse = undefined;
      }
    }

    if (intent === 'plan_and_edit' && plan) {
      if (
        isShallowUserEchoPlan(prompt, plan.steps) ||
        (!hasFiles && plan.steps.length < 4)
      ) {
        const fb = buildLocalFallbackPlan(prompt, !hasFiles);
        plan = {
          title: fb.title,
          summary: fb.summary,
          steps: fb.steps,
          filesToTouch: fb.filesToTouch.length ? fb.filesToTouch : plan.filesToTouch,
          isInitialBuild: !hasFiles,
        };
      }
    }

    return NextResponse.json({
      success: true,
      intent,
      chatResponse: intent === 'chat' ? chatResponse : undefined,
      plan: intent === 'plan_and_edit' ? plan : undefined,
    });
  } catch (error) {
    console.error('[route-intent]', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
