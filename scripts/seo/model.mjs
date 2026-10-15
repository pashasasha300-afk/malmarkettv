import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const profileRegistry = JSON.parse(
  readFileSync(new URL("../../seo/profile-ids.json", import.meta.url), "utf8"),
);
export const ORIGIN = "https://tv.malmarket.app";
export const LOCALES = ["zh", "en"];
const zhLanguages = JSON.parse(
  readFileSync(
    new URL("../../src/language-labels.json", import.meta.url),
    "utf8",
  ),
);
const enLanguages = JSON.parse(
  readFileSync(
    new URL("../../seo/language-names-en.json", import.meta.url),
    "utf8",
  ),
);
const categoryNames = {
  animation: ["动画", "Animation"],
  auto: ["汽车", "Auto"],
  business: ["财经", "Business"],
  classic: ["经典", "Classic"],
  comedy: ["喜剧", "Comedy"],
  cooking: ["美食", "Cooking"],
  culture: ["文化", "Culture"],
  documentary: ["纪录片", "Documentary"],
  education: ["教育", "Education"],
  entertainment: ["娱乐", "Entertainment"],
  family: ["家庭", "Family"],
  general: ["综合", "General"],
  public: ["公共", "Public"],
  kids: ["少儿", "Kids"],
  legislative: ["议会", "Legislative"],
  lifestyle: ["生活", "Lifestyle"],
  movies: ["电影", "Movies"],
  music: ["音乐", "Music"],
  news: ["新闻", "News"],
  outdoor: ["户外", "Outdoor"],
  relax: ["放松", "Relaxation"],
  religious: ["宗教", "Religious"],
  science: ["科学", "Science"],
  series: ["电视剧", "Series"],
  shop: ["购物", "Shopping"],
  sports: ["体育", "Sports"],
  travel: ["旅行", "Travel"],
  weather: ["天气", "Weather"],
};
export function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function json(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
export function countryName(code, locale) {
  try {
    return new Intl.DisplayNames([locale === "zh" ? "zh-CN" : "en"], {
      type: "region",
    }).of(code === "UK" ? "GB" : code);
  } catch {
    return code;
  }
}
export function languageName(code, locale) {
  if (locale === "zh" && zhLanguages[code]) return zhLanguages[code];
  if (locale === "en" && enLanguages[code]) return enLanguages[code];
  try {
    const name = new Intl.DisplayNames([locale === "zh" ? "zh-CN" : "en"], {
      type: "language",
    }).of(code);
    return name === code
      ? locale === "zh"
        ? "其他语言"
        : "Other language"
      : name;
  } catch {
    return locale === "zh" ? "其他语言" : "Other language";
  }
}
export function categoryName(code, locale) {
  return (
    categoryNames[code]?.[locale === "zh" ? 0 : 1] ||
    (locale === "zh" ? "其他分类" : "Other category")
  );
}
export function safeWebsite(value) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function channelSlug(id) {
  return (
    id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    createHash("sha256").update(id).digest("hex").slice(0, 10)
  );
}
export function countryPath(code, locale) {
  return `/${locale}/countries/${code.toLowerCase()}/`;
}
export function channelPath(id, locale) {
  return `/${locale}/channels/${channelSlug(id)}/`;
}
export function watchPath(id, country) {
  const params = new URLSearchParams();
  if (id) params.set("channel", id);
  if (country) params.set("country", country);
  return "/watch/" + (params.size ? "?" + params : "");
}
export function selectProfiles(channels) {
  const priority = [
    "France24.fr",
    "NHKWorldJapan.jp",
    "3ABNEnglish.us",
    "DWEnglish.de",
    "AlJazeeraEnglish.qa",
  ];
  const eligible = channels.filter(
    (c) =>
      c.id &&
      c.name.trim() &&
      safeWebsite(c.website) &&
      c.languages.length &&
      c.categories.length,
  );
  const byCountry = new Map();
  for (const c of eligible) {
    if (!byCountry.has(c.country)) byCountry.set(c.country, []);
    byCountry.get(c.country).push(c);
  }
  for (const rows of byCountry.values())
    rows.sort((a, b) => {
      const ai = priority.indexOf(a.id),
        bi = priority.indexOf(b.id);
      return (
        (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) ||
        a.id.localeCompare(b.id, "en")
      );
    });
  const chosen = [];
  const countries = [...byCountry.keys()].sort();
  for (let round = 0; round < 3; round++)
    for (const code of countries) {
      if (chosen.length === 400) return chosen;
      const row = byCountry.get(code)[round];
      if (row) chosen.push(row);
    }
  return chosen;
}
export function buildPages(catalog, registry = profileRegistry) {
  const registered = new Set(registry);
  if (registered.size > 400 || registered.size !== registry.length)
    throw Error("Invalid first-stage channel profile registry");
  const profiles = catalog.channels.filter(
    (c) =>
      registered.has(c.id) &&
      c.name.trim() &&
      safeWebsite(c.website) &&
      c.languages.length &&
      c.categories.length,
  );
  const pages = [];
  for (const locale of LOCALES) {
    pages.push({ kind: "home", locale, path: `/${locale}/` });
    for (const country of catalog.countries) {
      const channels = catalog.channels.filter(
        (c) => c.country === country.code,
      );
      if (channels.length)
        pages.push({
          kind: "country",
          locale,
          path: countryPath(country.code, locale),
          country,
          channels,
        });
    }
    for (const channel of profiles)
      pages.push({
        kind: "channel",
        locale,
        path: channelPath(channel.id, locale),
        channel,
      });
  }
  return { pages, profiles };
}
export function alternatePaths(page) {
  const suffix = page.path.slice(3);
  return {
    "zh-Hans": "/zh" + suffix,
    en: "/en" + suffix,
    "x-default": "/zh" + suffix,
  };
}
export function metadata(page, catalog) {
  const en = page.locale === "en";
  if (page.kind === "home")
    return {
      title: en
        ? "MalMarket TV | Explore TV channels by country"
        : "MalMarket TV｜全球电视直播与地球选台",
      description: en
        ? `Explore the world through a country-based directory of ${catalog.channels.length.toLocaleString("en")} publicly listed TV channels. Browse metadata, visit broadcaster websites and open the live player.`
        : `通过地球探索 ${catalog.countries.length} 个国家与地区的公开电视直播目录。按国家查找频道、浏览真实语言和分类资料、访问频道官网并打开播放器。`,
    };
  if (page.kind === "country") {
    const name = countryName(page.country.code, page.locale);
    return {
      title: en
        ? `${name} TV channel directory | MalMarket TV`
        : `${name}电视直播频道目录｜MalMarket TV`,
      description: en
        ? `Browse ${page.channels.length} TV channels listed under ${name}. Find channel names, languages, categories and available channel profiles, with links to the player. Availability varies by location.`
        : `浏览目录登记在${name}的 ${page.channels.length} 个电视频道，查看频道名称、语言、分类及已有资料页，通过链接打开播放器。实际可播性依地区和提供方而异。`,
    };
  }
  const c = page.channel,
    name = countryName(c.country, page.locale),
    langs = c.languages
      .map((l) => languageName(l, page.locale))
      .join(en ? ", " : "、");
  return {
    title: en
      ? `${c.name}: channel information and player | MalMarket TV`
      : `${c.name}｜频道资料与直播入口｜MalMarket TV`,
    description: en
      ? `Public directory information for ${c.name}: country/region ${name}; languages ${langs}. Visit the listed broadcaster website, check data sources and open the player.`
      : `查看 ${c.name} 的公开频道资料：目录国家或地区为${name}，语言为${langs}。访问登记官网、了解数据来源并打开播放器。`,
  };
}
