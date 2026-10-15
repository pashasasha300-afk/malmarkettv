# MalMarket TV

正式网站：[https://tv.malmarket.app/](https://tv.malmarket.app/)

原创品牌的全球直播探索网站。React 19、TypeScript、Vite 7、Three.js/react-globe.gl、HLS.js、Supabase；Node.js 22.12+。实际解析 iptv-org 官方 API，不含虚构频道或演示频道。**正式站已连接 Supabase，并完成真实全量导入与公开查询验证；浏览器播放验收仍待完成。**

## 快速开始

```sh
npm ci
cp .env.example .env
# 填写 VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY
npm run dev
npm test
npm run build
```

正式站的公开 URL 和 publishable key 已保存于 `src/public-config.json`，Cloudflare 默认构建直接使用它们；环境变量可覆盖。该 key 仅具有 RLS 允许的公开权限，不是服务器密钥。切换到不同项目时必须同时提供对应的公开 key，不能只覆盖 URL。未配置时显示配置提示和空目录；不会把假数据伪装成已接入频道。视频直接连接提供方，Supabase 只保存业务数据。

## Supabase：你需要操作的页面

1. [Supabase Dashboard](https://supabase.com/dashboard)：打开现有项目；尚无项目则创建项目，选择适合受众的区域。无需为本版主动购买付费计划。
2. 全新项目可在 **SQL Editor → New query** 执行 [supabase/setup.sql](supabase/setup.sql) 后点击 **Run**，它一次完成当前全部迁移并刷新 API schema cache；已有这些表的项目不要重复初始化。也可按顺序执行 `supabase/migrations/202610150001_initial.sql`、`202610150002_directory.sql`、`202610150003_stream_url_hash.sql`。已完成前两份的项目仅执行第三份；不要重复执行第一份迁移。也可用 Supabase CLI 的 link / db push 迁移已有工程。
3. **Project Settings → API / API Keys**（新界面也可从 Connect 找到）：项目 URL 与公开 publishable/legacy anon key 填入前端环境变量；service_role 或 secret key 只放服务器 / Actions Secrets，不要发送到聊天、不加 VITE_ 前缀。
4. **Authentication → URL Configuration**：Site URL 为 `https://tv.malmarket.app`；Redirect URLs 加该域名及本地 `http://127.0.0.1:5173/`。**Authentication → Sign In / Providers → Email** 启用邮件 magic link。公网使用前在 **Authentication → Email / SMTP Settings** 配置自己的 SMTP 并验证送达；开发测试邮件有限额。邮件供应商费用由所选服务决定，本项目没有开通。
5. **Table Editor**：导入后检查 countries、channels、streams、sync_logs。

## GitHub 定时同步

[仓库 Actions secrets](https://github.com/pashasasha300-afk/malmarkettv/settings/secrets/actions) → New repository secret：

- `SUPABASE_URL`：可选的项目 URL 覆盖值，未设置则使用正式站公开配置中的地址。
- `SUPABASE_SECRET_KEY`：Supabase API Keys 中以 `sb_secret_` 开头的服务端 secret key；兼容旧名 `SUPABASE_SERVICE_ROLE_KEY`。仅供后台导入和限量探测。不可存入普通代码、前端构建变量或 README。

[Actions](https://github.com/pashasasha300-afk/malmarkettv/actions) → **Maintain channel directory → Run workflow** 首次导入。同步脚本、公开项目配置或维护工作流在 main 更新时也会触发导入；导入后以公开 key 验证目录查询。之后每天 UTC 03:23 自动执行；GitHub schedule 可能延迟，并遵守 GitHub 对长期不活跃仓库的计划任务规则。工作流 concurrency 避免定时/手动运行重叠；不要同时在其他终端运行导入。

本地服务端调试：在被 gitignore 的 `.env` 设置上述两个服务端变量后运行 `npm run sync` / `npm run health`。不带密钥的数据验证：`node scripts/sync.mjs --dry-run`。

同步有 300 行分批、三次指数退避重试、失败日志、频道 ID / URL SHA256 去重（源 ID）与数据库 URL 哈希唯一索引；完整导入成功后才停用本次未出现的目录源。人工 hidden/manual_name/disabled/official_verified 不在同步写入字段中。仅明确关联频道、HTTPS、HLS 且无需自定义 Referer/User-Agent 的源参与第一版，排除成人、关闭频道与上游 blocklist。未关联源、HTTP、其他传输协议暂不收录，数量不代表已验证可播。官方验证标记只能在核实提供方公开来源后由维护者设置，默认不宣称官方授权。

健康任务每天最多检查 100 个最久未检查的源，并发 4、单次最长约 10 秒、最多 3 次重定向；仅请求响应头后关闭连接，不请求整个视频。域名的全部 DNS 答案必须是公共单播 IP，连接固定到已检查 IP，每次重定向重新校验；阻止内网、环回、链路本地、保留地址、凭据 URL 与非标准端口。保持 TLS 校验。HTTP 可达不证明清单有效、CORS、编码、片段或浏览器可播放；显示最后检查时间，不伪装实时健康。当前限额意味着全库检查周期较长，可按预算增加任务频率与配额。

## 部署静态前端

本仓库采用 **Cloudflare Workers Static Assets＋预渲染 HTML**。`npm run build` 先读取 Supabase 的公开 RLS 数据、构建播放器和地球组件，再输出中英文首页、非空国家页和固定首批频道资料页。正文与导航不依赖 JavaScript。构建或数据校验失败会停止发布，不生成空目录替代真实数据。

`wrangler.json` 的 `assets.not_found_handling = "404-page"` 返回真正的 404；`worker/index.js` 处理根地址到 `/zh/` 的 301，以及旧 `?channel=` 链接到 `/watch/` 的 302。播放器与后台分别输出真实 HTML 入口 `/watch/`、`/admin/`，用 noindex 排除搜索索引，保留原有互动功能。不要恢复 `/* /index.html 200` 或全站 SPA fallback，这会让不存在路径错误返回 200。[Cloudflare SSG 与 404 文档](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/)

SEO URL、内容准入、定时更新及验证命令见 [SEO 运维说明](seo/README.md)。

Cloudflare Dashboard → **Workers & Pages → 现有 Worker → Settings → Build**：

- 根目录：仓库根目录。
- Build command：`npm run build`。
- Deploy command：`npx wrangler deploy`（自动读取仓库 wrangler.json，上传 dist）。
- Worker 名称与 `wrangler.json` 中的 `name` 一致，默认 `malmarkettv`；若现有 Worker 名称不同，请先修改该字段匹配。
- 构建环境使用 Node 22；在构建变量中配置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。这两个值须在 Vite 构建时提供，不能仅放在 Worker 运行时变量中。

前端支持新版 `VITE_SUPABASE_PUBLISHABLE_KEY` 与兼容变量 `VITE_SUPABASE_ANON_KEY`，优先使用前者。只在 Worker 运行时设置这些变量不会更新已经构建的静态 JS；必须在 **Settings → Build → Variables and secrets** 为构建提供它们，然后重新构建。当前页面的“尚未连接 Supabase”表示前端构建未取得项目 URL 或公开 key，不能据此判断数据库是否有数据。

连接诊断：执行 `npm run check:connection`，默认检查正式站项目；如需其他项目，可将公开项目 URL 和 key 放入被忽略的本地 `.env` 覆盖。脚本实际调用匿名目录 RPC，报告频道总数并验证三个国家的频道/源关联；空目录、迁移缺失、错误 key 或网络失败都会以非零状态退出。它不会把查询成功当成浏览器播放成功。

本地检查：`npm run build` 后执行 `npm run preview:cloudflare`；本地或外部 CI 完整发布命令为 `npm run deploy`（需要已授权的 Cloudflare 凭据）。更新前端环境变量后必须重新构建。Supabase 迁移与 GitHub Secrets 的配置保持独立。

不需要付费地图 API，也不经过自建视频 CDN。现有免费额度可用于初步验证；正式使用的数据库、邮件、构建及托管额度取决于供应商和流量，需要升级时先确认套餐与预算。本次未购买、开通或承诺任何付费服务。

## 管理员与权限

先在 `/watch/` 的顶部登录入口通过邮件登录。项目所有者在 Supabase SQL Editor 中授权现有用户（替换真实 UUID）：

```sql
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = 'YOUR-USER-UUID';
```

用户退出后重新登录刷新 JWT，访问 `/admin`。可查询频道、人工改名、隐藏/恢复、禁用/启用源、处理反馈、查日志。前端角色判断仅控制界面；实际更改由 RLS 的可信 app_metadata 决定，user_metadata 伪造 role 无效。普通用户仅能操作自己的收藏与记录，游客只读公开非成人未隐藏目录及提交反馈；反馈与日志不会公开。需要手工新增频道/修改源 URL 时，第一版使用 Supabase Table Editor（需项目管理员）；完整增删源、审计及批量管理界面留在后续阶段。

收藏游客存在当前浏览器，登录收藏与观看记录保存在账户；游客数据不自动合并到账号，避免在共享设备误上传。退出恢复游客视图。最近观看仅在视频触发真实 playing 事件后写入。

## 播放和界面

- 公开首页与国家/频道目录有中文和英文预渲染版本；原有交互式选台与播放器保留在 `/watch/`，旧频道分享链接会跳转至该入口。
- 3D 地球按需下载，低核心数 / 减少动态效果设备默认平面地图；WebGL2 检查失败降级。地图触控拖动及按钮缩放、列表可键盘操作。探索时为地球＋频道双栏；选台后播放器占主区域，旁边保留频道，地球缩为可收起的探索区。手机播放器在上、频道常驻下方，地球默认不加载，点击入口再展开。
- 使用国家级数据坐标；不把国家点标成频道城市或演播室地址。国家无收录源显示 0，不填充虚构频道。
- 按频道名称搜索，国家、语言、分类使用中文下拉选项，支持清除筛选；频道资料显示可读名称，当前频道高亮，台标失败显示占位。每次最多 200 条，请缩小范围；随机为当前结果内随机。主要界面中文，国家名用 Intl.DisplayNames；尚未提供完整多语言切换。
- Safari 优先原生 HLS，其他 MSE 浏览器用 HLS.js。原生 controls 提供音量、静音、播放、全屏；画中画取决于平台；HLS.js 清晰度来自实际 manifest，原生 HLS 由浏览器自适应。全屏和画中画按钮按平台支持显示，媒体尚未就绪时禁用。
- 每源至多两轮连接，再尝试下一个源；无播放/持续缓冲约 20 秒超时，不无限加载。切台及卸载销毁 HLS、清空 video src 并释放连接。自动播放受限提示手动点击；无 DRM/login/geo bypass 或视频中转。
- 403/451 标记访问限制，404/410 标记源失效，媒体错误标记解码/编码问题，浏览器无 HTTP 可见信息时仅报告网络/CORS 不确定，不谎称精准检测地理封锁。
- 首页不再展示邮箱表单，登录收进顶部入口，游客无需登录即可观看。收藏、最近观看、当前结果内随机选台和分享链接保留。音量与静音保存在本机；真正触发 playing 后记住上次频道，回来显示“继续观看”，不会自动连接上次视频源。
- 播放失败显示中文原因、有限重连及手动重试；源探测状态、CORS、诊断错误、检查时间和元数据更新时间仅在“技术详情”展开后显示，不宣称源可用或编造节目单。
- 节目单与四路同看依请求推迟，第一版未通过完整闭环验收前不加入。

## 验证与限制

详见 [验证报告](docs/VALIDATION.md)。`npm test` 执行 12 项核心/数据库/SEO 测试及 15 项组件交互测试（`npm run test:ui`）；数据库测试真实执行 PostgreSQL 引擎迁移和多用户 RLS 隔离（PGlite 模拟 auth 函数），组件测试模拟桌面/手机 viewport 和媒体 API，仍需在目标 Supabase 实例验收 JWT/Auth/PostgREST。浏览器播放、移动布局和备用源切换需要真实浏览器实测，不能由 build 或 HTTP 200 代替。真实目录依地区、时间与版权随时变化。

## 公开数据与素材

2026-10-15 核对：iptv-org [API 文档](https://github.com/iptv-org/api)、[数据库](https://github.com/iptv-org/database)、[直播目录](https://github.com/iptv-org/iptv) 当前许可证均为 Unlicense。官方 streams/feeds/logos API 分表关联，数据每日变化。台标与节目版权仍属于各自权利人，目录开放许可不赋予节目转播授权。页面提供源出处、官网及私有纠错/下架反馈，也可通过 [GitHub Issues](https://github.com/pashasasha300-afk/malmarkettv/issues) 联系维护者。

`public/country-locations.json` 由 [mledoze/countries](https://github.com/mledoze/countries) 国家级 latlng 派生，ODbL 1.0，保留许可 `public/country-locations-LICENSE.txt` 并公开派生坐标数据；UK 是上游 iptv-org 使用的代码，映射到 GB 的国家级坐标。平面地图来自 [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) 公有领域数据；地图表达仅为导航示意，不表示对边界政治地位的主张。地球 Blue Marble 纹理来自 three-globe 示例 / NASA。`scripts/assets.mjs` 可重建素材，未在同步任务中频繁请求地理资源。
