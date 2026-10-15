# 验证记录（2026-10-15）

## 已完成

- `npm run build`：TypeScript 严格检查及 Vite 生产构建通过。地球独立按需 chunk，仍约 550KB gzip；主入口包含 HLS，后续可进一步拆分。
- `npm test`：IP/URL 安全检查、DNS 混合内外网拒绝、去重及成人/下架/不可直连源过滤通过。
- PostgreSQL/PGlite 执行三份真实迁移（包括长 URL 哈希去重）：游客看不到隐藏频道及源、游客不能写收藏、用户 A/B 收藏和历史隔离、伪造 user_metadata 管理员无效、可信 app_metadata 管理权限生效、无源国家 0 计数、搜索 RPC 返回关联源。
- 全量官方 API dry-run：7,997 频道、11,414 源、178 国家/地区。初次为 dry-run；随后已真实导入 Supabase，详见下方正式环境记录，数量不代表可播。
- 国家代码核对发现 iptv-org 使用 UK，已映射到 GB 国家坐标；国家没有频道时仍可保留 0 计数。
- 六国低频 HTTP 样本检查见 [stream-probes.json](stream-probes.json)：法国样本 TLS 证书不匹配；英国 5USA、巴西样本本次 404；日本 NHK 样本 HTTP 206 但 CORS 头为 `0`，不能据此认定 HLS.js 可播放；美国 3ABN、印度样本 HTTP 200、CORS `*`。巴西样本相邻两次检查出现 200→404，说明目录可达性会变化。

## 尚未完成，不能作为验收通过

- 远程迁移、正式导入与匿名 PostgREST 查询现已完成；邮件登录、跨设备同步与两个真实账户 JWT 权限验收仍待完成。
- 当前自动化浏览器 inventory 为空，本地 IAB 不可用；未实际观察桌面和手机页面，未实际解码任何国家视频。
- 自动备用源切换、播放器连接释放、自动播放限制、原生全屏/PiP 已实现但未经过真实浏览器验收；HTTP 检查不是播放测试。
- 正式站 https://tv.malmarket.app/ 已发布，GitHub Secrets 已配置；维护工作流首次真实导入和限量健康检查已成功，后续每天定时执行。
- 未做节目单、四路同看与完整后台增删源功能；按第一版闭环优先顺序后置。

## 接入后的验收步骤

1. 运行迁移和首次 Actions 导入，确认 sync_logs success，列表、国家计数、空国家提示来自真实 Supabase。
2. 1440×900 桌面和 390×844 手机各检查地球/平面/列表、拖动缩放、国家选台、频道抽屉、搜索、页面横向溢出及键盘焦点。
3. 从当前所在地区选择至少三国真实频道，记录浏览器版本、视频 playing 时间、manifest/segment HTTP/CORS、MediaError；失败如实记录，不绕过地区限制。
4. 管理员在测试专用频道配置一个 404 主源和一个已验证可播备用源，核实每源至多两轮后切换，所有源失败后停止；切台在 DevTools 确认旧源请求停止。不用模拟成功代替真实播放。
5. 两个真实 Auth 账号交替登录，确认只读写自己的收藏、历史；游客请求私有表不可读取，普通账号直接调用隐藏/启用操作不得成功，伪造 user_metadata 无效。
6. 用正常部署的服务端 secrets 执行第二次同步，确认人工改名/隐藏/禁用保留，缺失源 inactive，日志成功；移除一个测试 secret 触发失败而非假成功。不要用真实生产源做破坏性试验。
7. 完成上述验收后再扩充可靠 EPG 和按需四路观看。

## Cloudflare Workers SPA 路由修复

删除 `public/_redirects` 自匹配通配重写，改用 `wrangler.json` 的 `assets.directory: ./dist` 与 `not_found_handling: single-page-application`。生产构建及 `wrangler deploy --dry-run` 通过，确认 dist 不包含 `_redirects`。Wrangler 本地运行验证 `/`、`/admin`、`/explore/example?channel=test` 在导航请求下均为 HTTP 200，与构建的 index.html 内容一致且无重定向；实际 JS 与 world.svg 分别返回正确的 JavaScript/SVG Content-Type。此记录验证本地 Workers 路由，不代表已确认 Cloudflare 线上重新部署成功。

## 正式环境连接与全量导入

用户在 Supabase 执行初始化与长 URL 哈希索引迁移后，维护工作流 [38666683007](https://github.com/pashasasha300-afk/malmarkettv/actions/runs/38666683007) 的测试、真实导入、公开查询、健康检查全部成功。匿名查询核对 7,997 频道、11,414 源、178 个有源国家/地区，线上静态 JS 已包含正确项目地址与公开 publishable key。服务端 secret 仅在 GitHub Actions 使用。

多国源响应结果见 [production-check.json](production-check.json)：美国 3ABN、法国 France 24 的样本清单端点返回 200 和 CORS *；日本结果按实际记录。探测仅代表本次服务端 HTTP 响应，不证明片段、编码、地区限制或浏览器实际播放。自动化浏览器仍未连接，因此播放画面、音频、移动布局及自动备用源切换未实测，不能将此记录称为完整播放验收。
