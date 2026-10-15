import languageLabels from "./language-labels.json";
export const categories: Record<string, string> = {
  animation: "动画",
  auto: "汽车",
  business: "财经",
  classic: "经典",
  comedy: "喜剧",
  cooking: "美食",
  culture: "文化",
  documentary: "纪录片",
  education: "教育",
  entertainment: "娱乐",
  family: "家庭",
  general: "综合",
  public: "公共",
  interactive: "互动",
  kids: "少儿",
  legislative: "议会",
  lifestyle: "生活",
  movies: "电影",
  music: "音乐",
  news: "新闻",
  outdoor: "户外",
  relax: "放松",
  religious: "宗教",
  science: "科学",
  series: "电视剧",
  shop: "购物",
  sports: "体育",
  travel: "旅行",
  weather: "天气",
};
export const languages: Record<string, string> = languageLabels;
const regions = new Intl.DisplayNames(["zh-CN"], { type: "region" }),
  languageNames = new Intl.DisplayNames(["zh-CN"], { type: "language" });
export function countryName(code: string) {
  try {
    return regions.of(code === "UK" ? "GB" : code) || "地区未提供";
  } catch {
    return "地区未提供";
  }
}
export function languageName(code: string) {
  if (languages[code]) return languages[code];
  try {
    const name = languageNames.of(code);
    return name === code ? "其他语言" : name || "其他语言";
  } catch {
    return "其他语言";
  }
}
export function categoryName(code: string) {
  return categories[code] || "其他分类";
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function storeValue(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Playback still works when storage is unavailable. */
  }
}
export function channelLink(id: string) {
  const url = new URL(location.origin + "/");
  url.searchParams.set("channel", id);
  return url.href;
}
export type VolumePreference = { volume: number; muted: boolean };
export function volumePreference(): VolumePreference {
  const value = readStored<Partial<VolumePreference>>("player-volume", {});
  return {
    volume:
      typeof value.volume === "number" && Number.isFinite(value.volume)
        ? Math.max(0, Math.min(1, value.volume))
        : 1,
    muted: value.muted === true,
  };
}
