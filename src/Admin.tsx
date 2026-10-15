import { useEffect, useState } from "react";
import { db } from "./data";
export default function Admin() {
  const [allowed, setAllowed] = useState(false),
    [query, setQuery] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [feedback, setFeedback] = useState<any[]>([]),
    [logs, setLogs] = useState<any[]>([]),
    [message, setMessage] = useState("请先在首页登录管理员账户");
  useEffect(() => {
    void db?.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata.role === "admin") setAllowed(true);
    });
  }, []);
  async function load() {
    if (!db) return;
    const results = await Promise.all([
      db
        .from("channels")
        .select(
          "id,name,manual_name,hidden,streams(id,url,disabled,official_verified)",
        )
        .ilike("name", "%" + query + "%")
        .limit(30),
      db
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);
    const error = results.find((r) => r.error)?.error;
    if (error) setMessage(error.message);
    else {
      setRows(results[0].data || []);
      setFeedback(results[1].data || []);
      setLogs(results[2].data || []);
      setMessage("已更新。管理员授权由数据库 RLS 校验。");
    }
  }
  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);
  async function update(table: string, id: string | number, values: object) {
    const { error } = await db!.from(table).update(values).eq("id", id);
    if (error) setMessage(error.message);
    else void load();
  }
  return (
    <div style={{ padding: 30, maxWidth: 1000, margin: "auto" }}>
      <a href="/">← 回到 MalMarket TV</a>
      <h1>频道维护</h1>
      <p>{message}</p>
      {allowed && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <input
              aria-label="管理员搜索"
              placeholder="搜索频道名称"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button>查询</button>
          </form>
          {rows.map((c) => (
            <article
              key={c.id}
              style={{ padding: 20, borderBottom: "1px solid #345" }}
            >
              <h3>
                {c.manual_name || c.name} <small>{c.id}</small>
              </h3>
              <button
                onClick={() =>
                  void update("channels", c.id, { hidden: !c.hidden })
                }
              >
                {c.hidden ? "恢复频道" : "隐藏频道"}
              </button>
              <button
                onClick={() => {
                  const name = prompt(
                    "人工显示名称（留空恢复目录名称）",
                    c.manual_name || "",
                  );
                  if (name !== null)
                    void update("channels", c.id, {
                      manual_name: name || null,
                    });
                }}
              >
                修改显示名
              </button>
              {c.streams.map((s: any) => (
                <p key={s.id} style={{ overflowWrap: "anywhere" }}>
                  {s.url}{" "}
                  <button
                    onClick={() =>
                      void update("streams", s.id, { disabled: !s.disabled })
                    }
                  >
                    {s.disabled ? "启用源" : "禁用源"}
                  </button>
                </p>
              ))}
            </article>
          ))}
          <h2>反馈 / 下架处理</h2>
          {feedback.map((f) => (
            <article key={f.id}>
              <p style={{ whiteSpace: "pre-wrap" }}>{f.message}</p>
              <small>
                {f.channel_id} · {f.status}
              </small>
              <button
                onClick={() =>
                  void update("feedback", f.id, { status: "resolved" })
                }
              >
                标为已处理
              </button>
            </article>
          ))}
          <h2>同步日志</h2>
          <pre style={{ overflow: "auto" }}>
            {JSON.stringify(logs, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
