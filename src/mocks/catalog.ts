import fixture from "./generated/vendor-catalog.json";
import type { CatalogVendor, CatalogPlan } from "@/lib/api/vendor-catalog";

type FixtureCatalog = { catalogVersion: string; items: CatalogVendor[]; plans: Record<string, CatalogPlan[]> };
/** 서버 VendorCatalog에서 생성. 앱의 실제 API 조회를 대신하는 fallback이 아니다. */
export const SEED_CATALOG = fixture as FixtureCatalog;
