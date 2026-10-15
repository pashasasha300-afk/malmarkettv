# 第一阶段 SEO 运维

正式域名： https://tv.malmarket.app/ 。沿用现有 Cloudflare Workers Static Assets，无新付费平台或地图服务。

## 路由与内容

- `/`：301 到 `/zh/`，不根据机器人或访问者地区返回不同正文。
- `/zh/`、`/en/`：中英文首页，有可抓取简介、国家普通链接、真实频道资料入口和按需地球组件。
- `/{locale}/countries/{code}/`：仅为当前快照中有真实关联直播源的国家/地区生成；代码来自 iptv-org，英国沿用 `uk`（hreflang 使用的是语言码 `en`，不使用错误的 `en-UK`）。名称按对应语言展示。
- `/{locale}/channels/{id-slug}-{sha256前10位}/`：由频道 ID 生成稳定路径，台名修改不改变 URL；资料必须有登记官网、语言与分类。固定名单 `seo/profile-ids.json` 为首批 400 个频道，初次按地区覆盖挑选，每地区至多 3 个，另对已知条目在其地区内优先。同步不会用新排序替换仍符合条件的已发布频道。后续扩充需先审核资料；不是为全部元数据批量造页。
- 国家页完整列出本地区实际收录频道；有详情页的名称链接到详情，其余链接到现有播放器。网站没有依据可靠资料时不编写频道介绍，只有可核实的目录字段、官网、来源及观看说明。
- `/watch/?channel=France24.fr`：原有播放器，`country=US` 可预设地区。`/?channel=…` 保留查询并 302 至此，播放器不需要 SEO 资料页才能播放。观看工具当前界面为中文；公开目录内容已双语化。
- `/admin/`：原有管理员界面，仍由 Supabase 权限保护。
- 不存在页面返回 HTTP 404 和 noindex 的错误正文，不回落到主页。已不在公开目录或不再满足资料条件的详情页会在重建后消失并返回 404。

## 抓取与元数据

所有公开正文在构建时生成；国家页与频道页无需客户端脚本。首页脚本仅增强地球，不替换预渲染正文和导航，禁用 JS 仍能逐级浏览。

每个公开页面有唯一 title、description、绝对 self-canonical、互相回链且含自身的 `zh-Hans` / `en` hreflang，`x-default` 指向同一路径的中文版本。分享标签包含 Open Graph、Twitter large image card 和 1200×630 PNG 品牌图。仅提供真实 WebSite / BreadcrumbList JSON-LD，不添加评分、节目、未经验证的 VideoObject 或直播可用性。

`sitemap.xml` 只收录已生成的 canonical URL，并带双语 alternate；没有可靠的页面内容修改时间，因此不编造 lastmod。`robots.txt` 允许读取公开内容及资源；观看、后台和 404 用 noindex，观看和后台不进入 sitemap。资料信息本身以公开来源说明为准，网页可抓取不代表搜索引擎已收录。

## 构建、更新与下架

```sh
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
npm run preview:cloudflare
# 在另一终端检查本地 HTTP 状态，不执行 JS：
npm run seo:check-http -- http://127.0.0.1:8787
# 正式域名验收：
npm run seo:check-http
```

完整构建必须执行 `npm run build`，不能单独复用已经改写过的 Vite HTML 来再次运行 render。构建从 Supabase 公开 key 读取资料，明确拒绝服务端 secret/service_role key；不读取用户收藏、观看记录或反馈。`seo/catalog.json` 是仅含公开频道资料的版本化快照，无视频地址、无用户数据。原始来源许可见根 README。

每日维护工作流在同步和健康检查成功后重新生成这个快照；仅公开内容有变化时由 GitHub Actions bot 提交，现有 Cloudflare Git 集成据此重建网站。写权限只用于提交该公开快照；`seo/catalog.json` 不属于维护工作流的 push 触发路径，避免循环导入。构建时仍会再次查询 Supabase，防止发布较旧的快照。服务器 secret 不进入任何 HTML 或 Git 文件。

预渲染内容是部署快照，不是实时数据库响应。紧急隐藏/下架后需立即运行维护工作流或重新部署，不能等待日更；发布后用具体 URL 确认 404。来源暂时播放失败不等于资料错误，因此本阶段不会据 HTTP 探测结果编造“在线/离线”索引状态。

## 第一阶段验证

- 1,158 个公开页面：2 个首页、356 个国家页、400 个频道的 800 个语言版本。
- 1,158 个独立 title；9362 个普通内部链接通过目标校验；canonical、互惠 hreflang、JSON-LD 和 sitemap 全量检查通过。
- 12 项核心/数据库/SEO 测试和 15 项 UI 测试通过，涵盖资料不足/空地区排除、稳定 URL 与固定名单、HTML/JSON 转义、旧播放链接、错误 HTTP 状态及现有播放器回归。
- [本地 HTTP 报告](../docs/seo-http-local.json)：不执行 JS 也能读取中英文正文；根地址、旧分享链接、真实页面、404、sitemap、robots、分享图及观看入口状态均按预期。
- 浏览器工具目前没有连接，因此没有冒充做过真实视频解码或桌面/手机截图。此次 SEO 没有改动 HLS 播放器实现，现有播放器组件回归仍通过。

## 站长工具

上线 HTTP 验证后先在 Google Search Console 添加 `tv.malmarket.app` 的 Domain 资源，按平台给出的 TXT 值验证域名；验证后提交 `https://tv.malmarket.app/sitemap.xml` 并用 URL 检查抽样。随后到 Bing Webmaster Tools，可选择从已验证的 Search Console 导入或独立 DNS 验证，再提交同一 sitemap。操作按会话一次一步引导，不预先填入占位验证 token，不承诺收录时间或排名。
