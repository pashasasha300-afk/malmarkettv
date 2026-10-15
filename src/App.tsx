import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { db, localRead, type Country, type Channel } from "./data";
import { FlatMap } from "./FlatMap";
import { Logo, LoginDialog, ExploreBoundary } from "./components";
import {
  categories,
  languages,
  categoryName,
  languageName,
  countryName,
  channelLink,
  readStored,
  storeValue,
} from "./presentation";
const Globe = lazy(() => import("./World"));
const Player = lazy(() =>
  import("./Player").then((m) => ({ default: m.Player })),
);
export function App() {
  const [countries, setCountries] = useState<Country[]>([]),
    [country, setCountry] = useState(""),
    [channels, setChannels] = useState<Channel[]>([]),
    [selected, setSelected] = useState<Channel | null>(null),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [language, setLanguage] = useState(""),
    [mode, setMode] = useState<"globe" | "map" | "list">(() =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      navigator.hardwareConcurrency <= 4
        ? "map"
        : "globe",
    ),
    [exploreOpen, setExploreOpen] = useState(
      () => !matchMedia("(max-width:700px)").matches,
    ),
    [tab, setTab] = useState("all"),
    [fav, setFav] = useState(localRead("favorites")),
    [recent, setRecent] = useState(localRead("recent")),
    [user, setUser] = useState<string | null>(null),
    [loginOpen, setLoginOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [listError, setListError] = useState(""),
    [directoryLoading, setDirectoryLoading] = useState(true),
    [directoryError, setDirectoryError] = useState(""),
    [queryVersion, setQueryVersion] = useState(0),
    [opening, setOpening] = useState(false),
    [last, setLast] = useState<{ id: string; name: string } | null>(() =>
      readStored("last-channel", null),
    );
  const listRef = useRef<HTMLElement>(null),
    exploreRef = useRef<HTMLElement>(null),
    watchRef = useRef<HTMLElement>(null);
  const selectedRef = useRef<Channel | null>(null);
  selectedRef.current = selected;
  useEffect(() => {
    let live = true;
    setDirectoryLoading(true);
    if (!db) {
      setDirectoryError("频道目录尚未连接，请稍后重试。");
      setDirectoryLoading(false);
      return;
    }
    Promise.resolve(db.rpc("country_counts"))
      .then(({ data, error }) => {
        if (!live) return;
        setDirectoryLoading(false);
        if (error) setDirectoryError("暂时无法加载国家目录，请重试。");
        else {
          setDirectoryError("");
          setCountries(
            (data || []).map((c: Country) => ({
              ...c,
              name: countryName(c.code),
            })),
          );
        }
      })
      .catch(() => {
        if (live) {
          setDirectoryLoading(false);
          setDirectoryError("网络连接失败，请稍后重试。");
        }
      });
    return () => {
      live = false;
    };
  }, [queryVersion]);
  useEffect(() => {
    if (!db) return;
    let live = true,
      version = 0;
    const load = async () => {
      const request = ++version;
      const {
        data: { session },
      } = await db!.auth.getSession();
      if (!live || request !== version) return;
      setUser(session?.user.id || null);
      setFav(session ? [] : localRead("favorites"));
      setRecent(session ? [] : localRead("recent"));
      if (session) {
        const [f, r] = await Promise.all([
          db!.from("favorites").select("channel_id"),
          db!
            .from("watch_history")
            .select("channel_id")
            .order("watched_at", { ascending: false })
            .limit(30),
        ]);
        if (!live || request !== version) return;
        if (f.error || r.error) setNotice("暂时无法同步个人记录，请稍后重试。");
        if (f.data) setFav(f.data.map((x) => x.channel_id));
        if (r.data) setRecent(r.data.map((x) => x.channel_id));
      }
    };
    void load();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    return () => {
      live = false;
      version++;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!db) {
      setLoading(false);
      setListError("频道目录尚未连接。");
      return;
    }
    let live = true;
    setLoading(true);
    setListError("");
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await db!.rpc("search_channels", {
          q: search,
          country_code: country,
          category_filter: category,
          language_filter: language,
          ids: tab === "favorites" ? fav : tab === "recent" ? recent : null,
        });
        if (!live) return;
        if (error) {
          setChannels([]);
          setListError("暂时无法加载频道，请重试。");
        } else {
          let rows: Channel[] = data || [];
          if (tab === "recent")
            rows.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
          setChannels(rows);
        }
      } catch {
        if (live) {
          setChannels([]);
          setListError("网络连接失败，请重试。");
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, country, category, language, tab, fav, recent, queryVersion]);
  const choose = (channel: Channel) => {
    setSelected(channel);
    setExploreOpen(!matchMedia("(max-width:700px)").matches);
    const url = new URL(location.href);
    url.searchParams.set("channel", channel.id);
    history.replaceState({}, "", url);
    if (matchMedia("(max-width:700px)").matches)
      requestAnimationFrame(() =>
        watchRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        }),
      );
  };
  useEffect(() => {
    let live = true;
    const id = new URLSearchParams(location.search).get("channel");
    if (!id || !db) return;
    setOpening(true);
    Promise.resolve(db.rpc("search_channels", { ids: [id] }))
      .then(({ data, error }) => {
        if (!live) return;
        if (data?.[0]) {
          setSelected(data[0]);
          setExploreOpen(!matchMedia("(max-width:700px)").matches);
        } else
          setNotice(
            error
              ? "暂时无法打开分享的频道，请稍后重试。"
              : "此频道暂未收录或已下架，请选择其他频道。",
          );
      })
      .catch(() => {
        if (live) setNotice("频道链接加载失败，请检查网络。");
      })
      .finally(() => {
        if (live) setOpening(false);
      });
    return () => {
      live = false;
    };
  }, []);
  const openLast = async () => {
    if (!last || !db || opening) return;
    setOpening(true);
    try {
      const { data, error } = await db.rpc("search_channels", {
        ids: [last.id],
      });
      if (data?.[0]) choose(data[0]);
      else
        setNotice(
          error
            ? "暂时无法加载，请稍后重试。"
            : "上次观看的频道已不可用，请选择其他频道。",
        );
    } catch {
      setNotice("网络连接失败，请稍后重试。");
    } finally {
      setOpening(false);
    }
  };
  const played = () => {
    const channel = selectedRef.current;
    if (!channel) return;
    const value = { id: channel.id, name: channel.name };
    setLast(value);
    storeValue("last-channel", value);
    setRecent((previous) => {
      if (previous[0] === channel.id) return previous;
      const next = [
        channel.id,
        ...previous.filter((x) => x !== channel.id),
      ].slice(0, 30);
      if (!user) storeValue("recent", next);
      return next;
    });
    if (user && db)
      void db
        .from("watch_history")
        .upsert({
          user_id: user,
          channel_id: channel.id,
          watched_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) setNotice("观看记录暂时无法同步。");
        });
  };
  const saveFavorite = async () => {
    if (!selected) return;
    const exists = fav.includes(selected.id);
    if (user && db) {
      const { error } = exists
        ? await db.from("favorites").delete().eq("channel_id", selected.id)
        : await db
            .from("favorites")
            .upsert({ user_id: user, channel_id: selected.id });
      if (error) {
        setNotice("收藏暂时无法同步，请重试。");
        return;
      }
    }
    const next = exists
      ? fav.filter((x) => x !== selected.id)
      : [selected.id, ...fav];
    setFav(next);
    if (!user) storeValue("favorites", next);
  };
  const clearFilters = () => {
    setSearch("");
    setCountry("");
    setCategory("");
    setLanguage("");
    setTab("all");
  };
  const pickCountry = (code: string) => {
    setCountry(code);
    setTab("all");
    if (matchMedia("(max-width:700px)").matches) {
      setExploreOpen(false);
      requestAnimationFrame(() =>
        listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
    }
  };
  const toggleExplore = () => {
    setExploreOpen((v) => !v);
    if (!exploreOpen)
      requestAnimationFrame(() =>
        exploreRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        }),
      );
  };
  const share = async () => {
    if (!selected) return;
    const url = channelLink(selected.id);
    try {
      if (navigator.share) {
        await navigator.share({
          title: selected.name + " · MalMarket TV",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("频道链接已复制。");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setNotice("请复制频道链接：" + url);
    }
  };
  const report = async () => {
    const message = prompt(
      "纠错 / 版权下架：请填写问题、证明链接及联系邮箱（不会公开）。",
    );
    if (!message) return;
    if (message.trim().length < 10) {
      setNotice("请填写至少 10 个字的问题描述。");
      return;
    }
    if (!db) {
      setNotice("请通过页脚的维护者入口提交反馈。");
      return;
    }
    const { error } = await db
      .from("feedback")
      .insert({ channel_id: selected?.id || null, message });
    setNotice(
      error ? "提交失败，请稍后重试。" : "反馈已提交，等待维护者处理。",
    );
  };
  const hasFilters = !!(
    search ||
    country ||
    category ||
    language ||
    tab !== "all"
  );
  const languageOptions = [
    ...new Set([
      ...Object.keys(languages),
      ...channels.flatMap((c) => c.languages),
    ]),
  ].sort((a, b) => languageName(a).localeCompare(languageName(b), "zh-CN"));
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="MalMarket TV 首页">
          <span className="brand-icon" aria-hidden="true">
            ◉
          </span>
          <span>
            MalMarket<b>TV</b>
          </span>
        </a>
        <div className="header-actions">
          <button
            aria-expanded={exploreOpen}
            aria-controls="explore-content"
            onClick={toggleExplore}
          >
            ◎ 探索地球
          </button>
          <button
            onClick={() => {
              setTab("favorites");
              listRef.current?.scrollIntoView({ block: "nearest" });
            }}
          >
            ♡ 收藏
          </button>
          {user ? (
            <button
              onClick={() =>
                void db?.auth.signOut().then(({ error }) => {
                  if (error) setNotice("退出失败，请重试。");
                })
              }
            >
              退出登录
            </button>
          ) : (
            <button onClick={() => setLoginOpen(true)}>登录</button>
          )}
        </div>
      </header>
      <main className={selected ? "layout is-watching" : "layout is-exploring"}>
        {selected && (
          <section className="watch" ref={watchRef} aria-label="正在观看">
            <div className="watch-heading">
              <Logo name={selected.name} url={selected.logo} />
              <div>
                <h1>{selected.name}</h1>
                <p>
                  {countryName(selected.country)} ·{" "}
                  {selected.languages.map(languageName).join("、") ||
                    "语言未提供"}{" "}
                  ·{" "}
                  {selected.categories.map(categoryName).join("、") || "未分类"}
                </p>
              </div>
            </div>
            <Suspense
              fallback={
                <div className="player-placeholder" role="status">
                  正在准备播放器…
                </div>
              }
            >
              <Player key={selected.id} channel={selected} onPlayed={played} />
            </Suspense>
            <div className="watch-actions">
              <button
                aria-pressed={fav.includes(selected.id)}
                onClick={saveFavorite}
              >
                {fav.includes(selected.id) ? "♥ 已收藏" : "♡ 收藏频道"}
              </button>
              <button onClick={share}>分享频道</button>
              {selected.website && (
                <a
                  className="button-link"
                  href={selected.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  频道官网 ↗
                </a>
              )}
              <button
                onClick={() => {
                  setSelected(null);
                  setExploreOpen(!matchMedia("(max-width:700px)").matches);
                  const url = new URL(location.href);
                  url.searchParams.delete("channel");
                  history.replaceState({}, "", url);
                }}
              >
                关闭播放
              </button>
            </div>
          </section>
        )}
        <section
          className={
            "explore " +
            (selected ? "compact " : "") +
            (exploreOpen ? "expanded" : "collapsed")
          }
          ref={exploreRef}
          aria-label="地球探索"
        >
          <div className="explore-heading">
            <div>
              {!selected ? (
                <>
                  <h1>换个坐标，看见世界。</h1>
                  <p>选择国家，听见当地的声音。</p>
                </>
              ) : (
                <h2>继续探索世界</h2>
              )}
            </div>
            <button
              aria-expanded={exploreOpen}
              aria-controls="explore-content"
              onClick={toggleExplore}
            >
              {exploreOpen ? "收起地球" : "展开地球"}
            </button>
          </div>
          {!selected && last && (
            <button className="resume" disabled={opening} onClick={openLast}>
              ▷ {opening ? "正在打开…" : "继续观看：" + last.name}
            </button>
          )}
          {opening && !selected && <p role="status">正在打开频道…</p>}
          <div id="explore-content" hidden={!exploreOpen}>
            {exploreOpen && (
              <>
                <div className="view-switch" aria-label="探索视图">
                  {(["globe", "map", "list"] as const).map((m, i) => (
                    <button
                      key={m}
                      className={mode === m ? "active" : ""}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      {["地球", "地图", "国家列表"][i]}
                    </button>
                  ))}
                </div>
                <div className="world">
                  {directoryLoading ? (
                    <div className="map-placeholder" role="status">
                      <span className="spinner" />
                      加载国家目录…
                    </div>
                  ) : directoryError ? (
                    <div className="empty">
                      <p role="alert">{directoryError}</p>
                      <button onClick={() => setQueryVersion((v) => v + 1)}>
                        重新加载
                      </button>
                    </div>
                  ) : mode === "globe" ? (
                    <ExploreBoundary
                      fallback={
                        <FlatMap countries={countries} select={pickCountry} />
                      }
                    >
                      <Suspense
                        fallback={
                          <div className="map-placeholder" role="status">
                            正在加载地球…
                          </div>
                        }
                      >
                        <Globe
                          countries={countries}
                          select={pickCountry}
                          compact={!!selected}
                          fallback={() => setMode("map")}
                        />
                      </Suspense>
                    </ExploreBoundary>
                  ) : mode === "map" ? (
                    <FlatMap countries={countries} select={pickCountry} />
                  ) : (
                    <div className="country-grid">
                      {countries.map((c) => (
                        <button
                          key={c.code}
                          className={c.code === country ? "active" : ""}
                          onClick={() => pickCountry(c.code)}
                        >
                          {c.name}
                          <small>
                            {c.count ? c.count + " 个频道" : "暂无收录源"}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="map-note">
                  拖动旋转 · 滚动缩放 · 标记为国家级位置
                </p>
              </>
            )}
          </div>
          {!selected && !directoryLoading && !directoryError && (
            <p className="directory-count">
              {countries.filter((c) => c.count > 0).length} 个国家与地区 ·{" "}
              {countries
                .reduce((n, c) => n + Number(c.count), 0)
                .toLocaleString()}{" "}
              个收录频道
            </p>
          )}
        </section>
        <aside className="channels" ref={listRef} aria-label="频道列表">
          <div className="panel-heading">
            <h2>选择频道</h2>
            {hasFilters && (
              <button className="text-button" onClick={clearFilters}>
                清除筛选
              </button>
            )}
          </div>
          <label className="sr-only" htmlFor="channel-search">
            搜索频道名称
          </label>
          <input
            id="channel-search"
            type="search"
            placeholder="搜索频道名称"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="sr-only" htmlFor="country-filter">
            国家与地区
          </label>
          <select
            id="country-filter"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">所有国家与地区</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
                {c.count ? " · " + c.count : " · 暂无收录源"}
              </option>
            ))}
          </select>
          <div className="filters">
            <label>
              <span className="sr-only">分类</span>
              <select
                aria-label="分类"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">所有分类</option>
                {Object.entries(categories)
                  .sort((a, b) => a[1].localeCompare(b[1], "zh-CN"))
                  .map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="sr-only">语言</span>
              <select
                aria-label="语言"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="">所有语言</option>
                {languageOptions.map((code) => (
                  <option key={code} value={code}>
                    {languageName(code)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <nav className="channel-tabs" aria-label="频道分组">
            {[
              ["all", "全部"],
              ["favorites", "收藏"],
              ["recent", "最近观看"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={tab === value ? "active" : ""}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
            <button
              className="random"
              disabled={loading || !channels.length}
              onClick={() =>
                choose(channels[Math.floor(Math.random() * channels.length)])
              }
            >
              ⤨ 随机
            </button>
          </nav>
          <div className="result-summary" role="status">
            {loading
              ? "正在加载频道…"
              : listError
                ? "加载失败"
                : channels.length === 200
                  ? "显示前 200 个频道，可筛选缩小范围"
                  : channels.length + " 个频道"}
            {!user && tab !== "all" && <small>当前浏览器的个人记录</small>}
          </div>
          <div className="channel-list" aria-busy={loading}>
            {loading ? (
              <div className="list-loading" aria-label="频道加载中">
                {Array.from({ length: 6 }, (_, i) => (
                  <div className="skeleton" key={i} />
                ))}
              </div>
            ) : listError ? (
              <div className="empty">
                <p role="alert">{listError}</p>
                <button onClick={() => setQueryVersion((v) => v + 1)}>
                  重新加载频道
                </button>
              </div>
            ) : channels.length ? (
              channels.map((c) => (
                <button
                  className={
                    "channel " + (selected?.id === c.id ? "selected" : "")
                  }
                  aria-current={selected?.id === c.id ? "true" : undefined}
                  key={c.id}
                  onClick={() => choose(c)}
                >
                  <Logo name={c.name} url={c.logo} />
                  <span className="channel-copy">
                    <b>{c.name}</b>
                    <small>
                      {countryName(c.country)} ·{" "}
                      {c.languages.map(languageName).join("、") || "语言未提供"}
                    </small>
                    <small>
                      {c.categories.map(categoryName).join("、") || "未分类"}
                    </small>
                  </span>
                  {selected?.id === c.id ? (
                    <span className="selected-label">已选</span>
                  ) : (
                    <span className="channel-arrow" aria-hidden="true">
                      ▷
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="empty">
                <h3>
                  {tab === "favorites"
                    ? "还没有收藏频道"
                    : tab === "recent"
                      ? "还没有观看记录"
                      : "没有找到频道"}
                </h3>
                <p>
                  {tab === "favorites"
                    ? "选台后点击“收藏频道”，下次更容易找到。"
                    : tab === "recent"
                      ? "开始播放后，频道会出现在这里。"
                      : "此范围暂无收录源，试试其他国家或筛选条件。"}
                </p>
                {hasFilters && (
                  <button onClick={clearFilters}>清除筛选，查看全部</button>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>
      <footer>
        <span>MalMarket TV · 世界正在直播</span>
        <a
          href="https://github.com/iptv-org/iptv"
          target="_blank"
          rel="noreferrer"
        >
          频道来源
        </a>
        <button onClick={report}>纠错 / 版权下架</button>
        <a href="https://github.com/pashasasha300-afk/malmarkettv/issues">
          联系维护者
        </a>
        <a href="/country-locations-LICENSE.txt">国家坐标许可</a>
        <small>
          直播由提供方直接提供，可播性依地区而异。公开目录不代表内容授权，成人频道默认不收录。
        </small>
      </footer>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <LoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onNotice={setNotice}
      />
    </>
  );
}
