"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

import Globe from "./_svg/Globe";
import HeroInputSubmitButton from "./Button/Button";
import AsciiExplosion from "@/components/shared/effects/flame/ascii-explosion";

export default function HeroInput() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prewarmTimer.current) clearTimeout(prewarmTimer.current);
    const t = prompt.trim();
    if (t.length < 20) return;

    prewarmTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/sandbox-prewarm", { method: "POST" });
        const data = await res.json();
        if (data?.success && data.sandboxId) {
          sessionStorage.setItem("pendingSandboxId", data.sandboxId);
        }
      } catch {
        /* ignore background prewarm */
      }
    }, 1500);

    return () => {
      if (prewarmTimer.current) clearTimeout(prewarmTimer.current);
    };
  }, [prompt]);

  const goToBuilder = () => {
    const p = prompt.trim();
    if (!p) return;
    sessionStorage.setItem("starterBrief", p);
    sessionStorage.removeItem("targetUrl"); // legacy clone param
    sessionStorage.removeItem("siteMarkdown");
    router.push("/generation");
  };

  return (
    <div className="max-w-552 mx-auto w-full z-[11] lg:z-[2] rounded-20 lg:-mt-76">
      <div
        className="overlay bg-accent-white"
        style={{
          boxShadow:
            "0px 0px 44px 0px rgba(0, 0, 0, 0.02), 0px 88px 56px -20px rgba(0, 0, 0, 0.03), 0px 56px 56px -20px rgba(0, 0, 0, 0.02), 0px 32px 32px -20px rgba(0, 0, 0, 0.03), 0px 16px 24px -12px rgba(0, 0, 0, 0.03), 0px 0px 0px 1px rgba(0, 0, 0, 0.05), 0px 0px 0px 10px #F9F9F9",
        }}
      />

      <label className="p-16 flex gap-8 items-start w-full relative border-b border-black-alpha-5">
        <Globe />

        <textarea
          className="w-full bg-transparent text-body-input text-accent-black placeholder:text-black-alpha-48 resize-none outline-none min-h-[48px]"
          placeholder="Жишээ: жижиг кофешопын лендинг, захиалгын форм, монгол хэлээр…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              goToBuilder();
            }
          }}
        />
      </label>

      <div className="p-10 flex justify-end items-center relative">
        <HeroInputSubmitButton
          dirty={prompt.trim().length > 0}
          buttonText="Builder руу очих"
          disabled={prompt.trim().length === 0}
          onClick={goToBuilder}
        />
      </div>

      <div className="h-248 top-84 cw-768 pointer-events-none absolute overflow-clip -z-10">
        <AsciiExplosion className="-top-200" />
      </div>
    </div>
  );
}
