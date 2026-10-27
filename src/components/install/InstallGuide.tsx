"use client";

import { useState } from "react";
import {
  INSTALL_PLATFORMS,
  installCommand,
  type InstallPlatform,
} from "@/lib/install-guide";

/**
 * 초대 코드로 에이전트를 설치하는 안내. 서버를 호출하지 않고 명령만 만들어 보여준다.
 * 아키텍처는 부트스트랩 스크립트가 직접 감지하므로 고르지 않는다.
 */
export function InstallGuide({
  code,
  serverUrl,
  detectedPlatform,
}: {
  code: string;
  serverUrl: string;
  detectedPlatform: InstallPlatform;
}) {
  const [platform, setPlatform] = useState(detectedPlatform);
  const info =
    INSTALL_PLATFORMS.find((p) => p.value === platform) ?? INSTALL_PLATFORMS[0];
  const command = installCommand(platform, code, serverUrl);
  return (
    <>
      <section className="overflow-hidden rounded-[10px] border border-border bg-card">
        <div
          role="tablist"
          aria-label="운영체제"
          className="flex border-b border-border px-2"
        >
          {INSTALL_PLATFORMS.map((p) => {
            const active = p.value === platform;
            return (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPlatform(p.value)}
                className={[
                  "relative flex h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3.5 text-[13px] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-blue",
                  active ? "font-semibold text-text" : "font-medium text-text2",
                ].join(" ")}
              >
                <span>{p.label}</span>
                {p.value === detectedPlatform && (
                  <span className="rounded-lg bg-blue-tint px-1.5 text-[10.5px] leading-4 font-semibold text-blue">
                    감지됨
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={[
                    "absolute right-2.5 -bottom-px left-2.5 h-0.5 rounded-[1px]",
                    active ? "bg-blue" : "bg-transparent",
                  ].join(" ")}
                />
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="flex flex-col gap-4 p-5">
          <span className="text-xs font-medium text-text2">
            {info.shell}에 붙여넣어 실행하세요
          </span>
          <CommandBlock
            prompt={info.prompt}
            command={command}
            label={`${info.shell} 설치 명령`}
          />
        </div>

        <div className="flex items-center gap-2.5 border-t border-border px-5 py-3.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-text3"
          />
          <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap">
            설치 후 확인
          </span>
          <span className="min-w-0 text-xs text-text3">
            터미널에 “Pulsemetry 설치가 끝났습니다.”가 보이면 완료입니다.
          </span>
        </div>
      </section>

      <dl className="m-0 grid grid-cols-[minmax(72px,120px)_minmax(0,1fr)] gap-3 rounded-[10px] border border-border bg-card px-4 py-[11px] text-[12.5px]">
        <dt className="text-text3">설치 경로</dt>
        <dd className="m-0 min-w-0 font-mono [overflow-wrap:anywhere] text-text">
          {info.installPath}
        </dd>
      </dl>
    </>
  );
}

function CommandBlock({
  prompt,
  command,
  label,
}: {
  prompt: string;
  command: string;
  label: string;
}) {
  const [copied, setCopied] = useState<{
    command: string;
    result: "done" | "failed";
  } | null>(null);
  // 운영체제를 바꾸면 이전 명령의 복사 상태를 보이지 않는다.
  const result = copied?.command === command ? copied.result : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied({ command, result: "done" });
    } catch {
      // 권한이 없으면 직접 선택해 복사하게 한다.
      setCopied({ command, result: "failed" });
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-stretch overflow-hidden rounded-lg bg-code">
        <div className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto px-[18px] py-4 font-mono text-[13px] leading-[1.6]">
          <span
            aria-hidden="true"
            className="shrink-0 text-code-dim select-none"
          >
            {prompt}
          </span>
          <code
            aria-label={label}
            className="whitespace-pre text-code-text select-all"
          >
            {command}
          </code>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`${label} 복사`}
          className={[
            "w-[88px] shrink-0 cursor-pointer border-0 border-l border-white/10 bg-transparent text-[12.5px] font-semibold hover:bg-white/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue",
            result === "done" ? "text-[#89b48d]" : "text-code-text",
          ].join(" ")}
        >
          {result === "done" ? "복사됨" : "복사"}
        </button>
      </div>
      {result === "failed" && (
        <p className="text-xs text-red">
          복사하지 못했습니다. 명령을 직접 선택해 복사하세요.
        </p>
      )}
    </div>
  );
}
