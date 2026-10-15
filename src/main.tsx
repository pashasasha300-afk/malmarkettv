import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { db, localRead, type Country, type Channel } from "./data";
import { Player } from "./Player";
import "./style.css";
import { FlatMap } from "./FlatMap";
const Admin = lazy(() => import("./Admin"));
const countryLabel = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const Globe = lazy(() => import("./World"));
function App() {
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
    [tab, setTab] = useState("all"),
    [fav, setFav] = useState(localRead("favorites")),
    [recent, setRecent] = useState(localRead("recent")),
    [user, setUser] = useState<string | null>(null),
    [email, setEmail] = useState(""),
    [notice, setNotice] = useState(
      db
        ? "正在连接频道目录…"
        : "尚未连接 Supabase。请按 README 配置后导入真实频道。",
    ),
    [loading, setLoading] = useState(false),
    [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!db) return;
    db.rpc("country_counts").then(({ data, error }) => {
      if (error) setNotice(error.message);
      else {
        setCountries(
          (data || []).map((c: Country) => ({
            ...c,
            name: countryLabel.of(c.code === "UK" ? "GB" : c.code) || c.name,
          })),
        );
        setNotice(data?.length ? "" : "目录为空，请先运行真实数据同步。");
      }
    });
    const load = async () => {
      const {
        data: { session },
      } = await db!.auth.getSession();
      setUser(session?.user.id || null);
      if (!session) {
        setFav(localRead("favorites"));
        setRecent(localRead("recent"));
      }
      if (session) {
        const [f, r] = await Promise.all([
          db!.from("favorites").select("channel_id"),
          db!
            .from("watch_history")
            .select("channel_id")
            .order("watched_at", { ascending: false })
            .limit(30),
        ]);
        if (f.data) setFav(f.data.map((x) => x.channel_id));
        if (r.data) setRecent(r.data.map((x) => x.channel_id));
      }
    };
    void load();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(() => {
      setTimeout(() => void load(), 0);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!db) return;
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await db!.rpc("search_channels", {
        q: search,
        country_code: country,
        category_filter: category,
        language_filter: language,
        ids: tab === "favorites" ? fav : tab === "recent" ? recent : null,
      });
      if (live) {
        setChannels(data || []);
        setLoading(false);
        if (error) setNotice(error.message);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [search, country, category, language, tab, fav, recent]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("channel");
    if (id && db)
      db.rpc("search_channels", { ids: [id] }).then(({ data }) => {
        if (data?.[0]) setSelected(data[0]);
      });
  }, []);
  const pickCountry = (code: string) => {
    setCountry(code);
    if (matchMedia("(max-width:700px)").matches) setDrawer(true);
  };
  const choose = (c: Channel) => {
    setSelected(c);
    setDrawer(false);
    const u = new URL(location.href);
    u.searchParams.set("channel", c.id);
    history.replaceState({}, "", u);
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
        setNotice(error.message);
        return;
      }
    }
    const next = exists
      ? fav.filter((x) => x !== selected.id)
      : [selected.id, ...fav];
    setFav(next);
    if (!user) localStorage.setItem("favorites", JSON.stringify(next));
  };
  const played = () => {
    if (!selected) return;
    const next = [
      selected.id,
      ...recent.filter((x) => x !== selected.id),
    ].slice(0, 30);
    if (recent[0] !== selected.id) {
      setRecent(next);
      if (!user) localStorage.setItem("recent", JSON.stringify(next));
      if (user && db)
        void db
          .from("watch_history")
          .upsert({
            user_id: user,
            channel_id: selected.id,
            watched_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error) setNotice(error.message);
          });
    }
  };
  const report = async () => {
    const message = prompt(
      "纠错 / 版权下架：请填写频道、问题、权利证明链接及可联系邮箱（不会公开）。",
    );
    if (!message) return;
    if (!db) {
      setNotice("请通过 GitHub Issues 提交反馈");
      return;
    }
    const { error } = await db
      .from("feedback")
      .insert({ channel_id: selected?.id || null, message });
    setNotice(error ? error.message : "反馈已提交，等待管理员处理");
  };
  return (
    <>
      <header>
        <a className="brand" href="/">
          ◉{" "}
          <span>
            MalMarket<b>TV</b>
          </span>
        </a>
        <span className="header-caption">世界正在直播</span>
        <div className="header-right">
          <span className="live-dot" /> LIVE EXPLORER{" "}
          <button
            onClick={() => setTab(tab === "favorites" ? "all" : "favorites")}
          >
            ♡ 收藏
          </button>
        </div>
      </header>
      <main>
        <section className="explore">
          <div className="eyebrow">TUNE INTO SOMEWHERE NEW</div>
          <h1>
            换个坐标，
            <br />
            <em>看见世界。</em>
          </h1>
          <p className="intro">转动地球，让当地的声音与画面抵达眼前。</p>
          <div className="view-switch">
            {(["globe", "map", "list"] as const).map((m, i) => (
              <button
                className={mode === m ? "active" : ""}
                key={m}
                onClick={() => setMode(m)}
              >
                {["◎ 地球", "▱ 地图", "☷ 列表"][i]}
              </button>
            ))}
          </div>
          <div className="world">
            {mode === "globe" ? (
              <Suspense fallback={<p>正在加载地球…</p>}>
                <Globe
                  countries={countries}
                  select={pickCountry}
                  fallback={() => setMode("map")}
                />
              </Suspense>
            ) : mode === "map" ? (
              <FlatMap countries={countries} select={pickCountry} />
            ) : (
              <div className="country-grid">
                {countries.map((c) => (
                  <button key={c.code} onClick={() => pickCountry(c.code)}>
                    {c.name}
                    <small>{c.count} 个频道</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="map-footer">
            <span>↔ 拖动旋转 · 滚动缩放</span>
            <span>● 国家级位置 · 不代表演播室地址</span>
          </div>
          <div className="stats">
            <div>
              <strong>{countries.filter((c) => c.count > 0).length}</strong>
              <span>国家与地区有收录源</span>
            </div>
            <div>
              <strong>
                {countries
                  .reduce((s, c) => s + Number(c.count), 0)
                  .toLocaleString()}
              </strong>
              <span>频道 · 可播性依地区而异</span>
            </div>
            <div>
              <strong>∞</strong>
              <span>探索的可能</span>
            </div>
          </div>
        </section>
        <aside className={"channels " + (drawer ? "open" : "")}>
          <div className="panel-heading">
            <h2>探索频道</h2>
            <button onClick={() => setDrawer(false)}>收起</button>
          </div>
          <input
            aria-label="搜索频道"
            placeholder="⌕  搜索频道、国家、语言…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="国家与地区"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">所有国家与地区</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} · {c.count}
              </option>
            ))}
          </select>
          <div className="filters">
            <input
              aria-label="分类"
              placeholder="分类，如 news"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <input
              aria-label="语言"
              placeholder="语言，如 eng"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>
          <nav>
            {[
              ["all", "全部"],
              ["favorites", "收藏"],
              ["recent", "最近"],
            ].map(([v, n]) => (
              <button
                key={v}
                className={tab === v ? "active" : ""}
                onClick={() => setTab(v)}
              >
                {n}
              </button>
            ))}
            <button
              aria-label="随机频道"
              disabled={!channels.length}
              onClick={() =>
                choose(channels[Math.floor(Math.random() * channels.length)])
              }
            >
              ⤨ 随机
            </button>
          </nav>
          <small>
            {loading
              ? "加载中…"
              : `找到 ${channels.length} 个频道（每次最多 200 个，请筛选缩小范围）`}
          </small>
          <div className="channel-list">
            {channels.map((c) => (
              <button
                className={
                  "channel " + (selected?.id === c.id ? "selected" : "")
                }
                key={c.id}
                onClick={() => choose(c)}
              >
                {c.logo ? (
                  <img
                    src={c.logo}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="channel-icon">▣</span>
                )}
                <span>
                  <b>{c.name}</b>
                  <small>
                    {c.country} · {c.categories.join(" / ") || "未分类"}
                  </small>
                </span>
                <span className="arrow">↗</span>
              </button>
            ))}
            {!channels.length && !loading && (
              <p className="empty">
                此范围暂无收录的直播源。尝试其他国家或筛选条件。
              </p>
            )}
          </div>
        </aside>
        <section className="watch">
          <div className="eyebrow">YOUR WINDOW TO THE WORLD</div>
          {selected ? (
            <>
              <div className="now">
                <span className="live-dot" /> 已选频道
              </div>
              <h2>{selected.name}</h2>
              <Player key={selected.id} channel={selected} onPlayed={played} />
              <div className="tools">
                <button onClick={saveFavorite}>
                  {fav.includes(selected.id) ? "♥ 已收藏" : "♡ 收藏频道"}
                </button>
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(location.href)
                      .then(() => setNotice("频道链接已复制"))
                      .catch(() => setNotice(location.href))
                  }
                >
                  ↗ 分享
                </button>
              </div>
              <p>
                {selected.country} ·{" "}
                {selected.languages.join(", ") || "语言未提供"}
              </p>
              {selected.website && (
                <a href={selected.website} target="_blank" rel="noreferrer">
                  频道官方网站 ↗
                </a>
              )}
              <p className="muted">
                节目单暂未提供。频道元数据更新于{" "}
                {new Date(selected.updated_at).toLocaleString()}。
              </p>
            </>
          ) : (
            <div className="player-empty">
              <div className="orbit">▷</div>
              <h2>此刻，世界在播什么？</h2>
              <p>
                在地图上选择一个国家，
                <br />
                再选一个频道开始观看。
              </p>
              <button onClick={() => setDrawer(true)}>探索频道 ↗</button>
            </div>
          )}
          <div className="account">
            <h3>随时回来，继续探索。</h3>
            <p>游客收藏保存在此浏览器。登录后收藏及观看记录存入个人账户。</p>
            {user ? (
              <button onClick={() => void db?.auth.signOut()}>退出登录</button>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!db) return;
                  const { error } = await db.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: location.origin },
                  });
                  setNotice(
                    error ? error.message : "登录链接已发送，请检查邮箱。",
                  );
                }}
              >
                <input
                  type="email"
                  required
                  placeholder="邮箱地址"
                  aria-label="登录邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button disabled={!db}>获取登录链接</button>
              </form>
            )}
          </div>
        </section>
      </main>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <footer>
        <span>
          MalMarket TV © {new Date().getFullYear()} · 独立的全球直播探索
        </span>
        <a
          href="https://github.com/iptv-org/iptv"
          target="_blank"
          rel="noreferrer"
        >
          数据来源：iptv-org ↗
        </a>
        <button onClick={report}>纠错 / 版权下架</button>
        <a href="https://github.com/pashasasha300-afk/malmarkettv/issues">
          联系维护者
        </a>
        <a href="/country-locations-LICENSE.txt">国家坐标 © mledoze / ODbL</a>
        <small>
          公开视频目录不代表内容授权。直播直接连接提供方，遵守地区、登录及版权限制。成人频道默认不收录。
        </small>
      </footer>
      <button className="mobile-open" onClick={() => setDrawer(true)}>
        ☷ 选择频道
      </button>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  location.pathname === "/admin" ? (
    <Suspense fallback={<p>加载管理工具…</p>}>
      <Admin />
    </Suspense>
  ) : (
    <App />
  ),
);
