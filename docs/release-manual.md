# 发版手册（打 tag → 自动出包 → 双渠道分发 → 自动更新）

发版是**全自动**的：把版本号同步好、推一个 `v*` 标签，`release.yml` 会构建 Windows +
macOS、用更新私钥签名、合并 `latest.json`、建 GitHub Release，并同步到自托管的
Cloudflare Pages。人要做的只有第 1 步和最后的验证。

> 早期版本要手工拼 `latest.json` 再 `gh release create`，现在 `publish` job 全包了，
> 不要再手动建 Release —— 会和 CI 打架。

## 分发渠道（两条，客户端自动择优）

| 渠道 | 地址 | 谁在用 |
| --- | --- | --- |
| 自托管（第一顺位） | R2 桶 `teacher-agent-dist` 的 `downloads/`，公共域 `pub-667c9f15cb424a8db14d7b4ef7bbb481.r2.dev` | 国内用户主路径，不看 github 脸色 |
| GitHub Releases | `github.com/wuli2025/teacher-agent/releases` | 兜底 + 人工下载 |

**为什么是 R2 不是 Pages**：Pages 单文件上限 25MiB，而本项目装包 win ~119MB / mac ~235MB
（带了 voice-live 的 sherpa + onnxruntime），差一个数量级。`r2.dev` 是 Cloudflare 给测试用的
公共域、带限流；命中限流时客户端会自动切下一个源（最坏退回 github 镜像，即没有自托管时的水平），
故可接受。要更稳可给桶绑自定义域，改 `updater.rs::SELF_HOST_BASE` +
`tauri.conf.json > endpoints` + `useUpdater.ts > WEB_ENDPOINTS` 三处常量即可。

两条渠道共用**同一份 `latest.json`**（里面的 url 写的是 github 地址）。自托管那一跳由客户端
`updater.rs::mirror_candidates` 按文件名拼出来，所以 **R2 挂了客户端会自动回落 github**，
不会把自己锁死在单一渠道。客户端完整下载候选链：

```
R2(r2.dev) → gh-proxy.com → ghfast.top → 直连 github
```

任一源卡死/失败自动切下一个（300s 总超时 + 30s 无字节的停滞看门狗，两道闸门）。
每个源下载后都做 minisign 验签，被劫持/返回错误页必然验签失败 → 跳下一个，故顺序安全。

## 1. 同步版本号（三处，必须一致）

```
package.json            "version": "1.0.2"     # 也是前端 __APP_VERSION__ 的来源（Web 版判断页面是否陈旧）
src-tauri/Cargo.toml    version = "1.0.2"      # 也是 /api/version 的来源（Web 版判断服务端是否陈旧）
src-tauri/tauri.conf.json  "version": "1.0.2"  # 决定安装包文件名与 latest.json 的 version
```

三处不一致会让 Web 版的更新提示误判（比如永远提示"刷新页面"），桌面端则会装完还提示有更新。

## 2. 打标签触发

```powershell
git tag -a v1.0.2 -m "……"
git push origin v1.0.2      # 触发 release.yml
```

`release.yml` 的三个 job：

1. **verify** —— `npm run build` + `cargo test --lib` + `cargo check -p polaris-cli`，不过不放行；
2. **release** —— Windows(NSIS，含 voice-live) 与 macOS(universal .app/.dmg) 并行构建 + 签名；
3. **publish** —— 收齐两端产物 → **改成 ASCII 名**（见下）→ 合并 `latest.json`
   → 建 GitHub Release(`make_latest`) → **回验每个下载 url 真的 200**
   → 同一批产物上传 R2 → **回验**自托管 `latest.json` 版本号 + 装包齐全。

### ⚠ 产物必须是纯 ASCII 文件名

`productName` 是「教师助手」，tauri 出的包名带中文，而 **GitHub 上传 Release 资产时会把非 ASCII
字符静默剥掉**：`教师助手_1.0.1_x64-setup.exe` → `_1.0.1_x64-setup.exe`。若 `latest.json` 里还写
原名，客户端**检查更新照常弹窗、一点更新就 404 失败**。v1.0.1 就是这么坏的，而且 **CI 全绿**——
因为当时只验了 json 格式、没验 url 真能下。

现在 publish job 会把产物改名成 `TeacherAgent_<版本>_x64-setup.exe` / `TeacherAgent.app.tar.gz`
再上传，并有两道闸：上传前扫非 ASCII 文件名，发布后逐个 `curl -I` 验 200。签名是对**文件字节**
签的，改名不影响验签。

## 3. 验证（CI 绿了之后）

CI 已经自动验过了（url 200 + 自托管版本号 + 装包齐全），下面是人工复核：

```powershell
# 自托管（客户端第一顺位，最该确认的一个）
Invoke-RestMethod "https://pub-667c9f15cb424a8db14d7b4ef7bbb481.r2.dev/downloads/latest.json"
# GitHub 兜底
Invoke-RestMethod "https://github.com/wuli2025/teacher-agent/releases/latest/download/latest.json"
```

两边都应返回新版 `version` + `windows-x86_64` / `darwin-x86_64` / `darwin-aarch64` 三个平台条目。

> ⚠️ **格式对 ≠ 能下**。v1.0.1 的 `latest.json` 完美无缺，三个 url 全 404。验证时一定要真发一次
> 请求；验安装包内容时别只看状态码——查首字节魔数（exe = `4d 5a`，tar.gz = `1f 8b`）+ 字节数
> 与本地一致，才能确认是真包而非某个回退页。

## 4. 自托管没同步上怎么办

CI 里上传 R2 那步需要仓库 Secrets `CLOUDFLARE_API_TOKEN`（R2 → Object Read & Write）与
`CLOUDFLARE_ACCOUNT_ID`。**没配则整步跳过**（只留一条 warning，GitHub 渠道照常可用，
客户端会回落镜像）。补发用本机已 `wrangler login` 的 OAuth 身份即可，不用 API token：

```powershell
pwsh scripts/publish-r2.ps1 -Tag v1.0.2
```

它会从 GitHub Release 拉回本版全部资产、校对 `latest.json` 版本号、上传（装包先、latest.json 后，
避免「已指新版但包还没上去」的空窗），最后回验端点与每个包。

## Web / Docker 版的"更新"

浏览器里装不了包，所以走的是另一套（`useUpdater.ts` 的 web 分支，桌面端不受影响）：

- **服务端版本 > 页面版本** → 浏览器缓存了旧 SPA，提示「刷新页面」，用户一键自解；
- **已发布版本 > 服务端版本** → 提示管理员在部署机执行 `docker compose pull && docker compose up -d`，
  前端只给命令、不放假按钮（浏览器没法替你升级镜像）。

版本真相取自与桌面端同一份 `latest.json`，所以两条线永远报同一个"最新版"。
服务端版本由 `/api/version` 提供（需登录态；不对未认证访客暴露精确版本，免得给已知漏洞递靶子）。

## 注意

- **更新私钥**：CI 用仓库 secret `TAURI_SIGNING_PRIVATE_KEY` / `..._PASSWORD`（本项目的 key 无密码，
  该 secret 存空值）签名；私钥文件在 `~/.tauri/teacher_updater.key`，**丢了就再也发不出能被老客户端
  接受的更新**（公钥已写死在各用户已装的包里）。公钥见 `tauri.conf.json > plugins.updater.pubkey`，
  指纹 `435D7F5B54F26CF3`。这对密钥是教师助手专用的，与 Polaris 那对无关。
- **macOS 未签名**：minisign 签名校验与 Apple 公证是两回事。更新包能下载并验签通过，但未做 Apple
  签名时自替换偶有不稳，首启仍需 `xattr -dr com.apple.quarantine`。要彻底顺滑需 Apple Developer
  证书（见 `docs/macos.md`）。
- `mac-build.yml`（`mac-v*` 标签）只出**未签名、无更新能力**的 dmg 供快速分发，**不能自动更新**；
  要自动更新一律走 `release.yml`（`v*` 标签）这条线。
