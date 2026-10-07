export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "pulsemetry.theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

// 클라이언트 모듈 밖에 두어 서버 레이아웃에서도 문자열을 읽을 수 있게 합니다.
// 저장소 접근이 막혀 있어도 시스템 테마는 적용합니다.
export const themeBootstrapScript = `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia(${JSON.stringify(SYSTEM_THEME_QUERY)}).matches?"dark":"light";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;})();`;
