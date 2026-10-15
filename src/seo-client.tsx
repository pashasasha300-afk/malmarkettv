import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Country } from "./data";
import "./seo.css";
const Globe = lazy(() => import("./World"));
const Map = lazy(() =>
  import("./FlatMap").then((m) => ({ default: m.FlatMap })),
);
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function HomeGlobe({
  countries,
  locale,
}: {
  countries: Country[];
  locale: "zh" | "en";
}) {
  const [flat, setFlat] = useState(
    () =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      navigator.hardwareConcurrency <= 4,
  );
  const select = (code: string) =>
    location.assign("/" + locale + "/countries/" + code.toLowerCase() + "/");
  const fallback = (
    <p>
      {locale === "en"
        ? "Use the country links below to explore."
        : "可使用下方国家链接继续浏览。"}
    </p>
  );
  return (
    <Boundary fallback={fallback}>
      <Suspense
        fallback={<p>{locale === "en" ? "Loading globe…" : "正在加载地球…"}</p>}
      >
        {flat ? (
          <Map countries={countries} select={select} locale={locale} />
        ) : (
          <Globe
            countries={countries}
            select={select}
            fallback={() => setFlat(true)}
            locale={locale}
          />
        )}
      </Suspense>
    </Boundary>
  );
}
// Preserve older email callbacks that were configured to return to the site root.
if (
  location.hash.includes("access_token=") ||
  new URLSearchParams(location.search).has("code")
)
  location.replace("/watch/" + location.search + location.hash);
else {
  const target = document.getElementById("home-globe"),
    data = document.getElementById("home-data");
  if (target && data) {
    try {
      const parsed = JSON.parse(data.textContent || "{}");
      createRoot(target).render(
        <HomeGlobe countries={parsed.countries} locale={parsed.locale} />,
      );
    } catch {
      /* Static links and content remain available. */
    }
  }
}
