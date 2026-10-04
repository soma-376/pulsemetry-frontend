import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** 실제 페이지처럼 App Router 안에서 탐색 링크를 렌더링한다. */
export const renderInRouter = (node: ReactNode) => renderToStaticMarkup(createElement(AppRouterContext.Provider, {
  value: { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "test" },
}, node));
