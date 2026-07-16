// ─────────────────────────────────────────────────────────────
// 自动更新（GitHub Releases 托管）—— 前端 = 后端状态机的「视图」
//
// 旧版是「纯前端、一堆离散 ref 各自维护」；现在更新逻辑收进 Rust 的唯一状态机
// （src-tauri/src/updater.rs，借鉴 OpenCode 桌面端 updater-controller）：
//   - 单飞：并发 check/apply 只跑一次，多次点击不重入；
//   - 可观测：后端每次状态流转 emit("updater://state")，这里 listen 订阅；
//   - 持久化 + 重启续提示：发现新版本落盘，下次启动离线也能先看到「有更新待装」。
//
// 本文件只做两件事：① 订阅后端状态 → 映射成下面这些「兼容旧名」的派生量
// （UpdateBanner / UpdatePanel 无需改动）；② 把用户动作转发成后端命令。
// 无网络 / 还没发布 release 都会被静默吞掉，不打扰用户。
//
// ── Web/Docker 版（非 Tauri）──
// 浏览器里没有 tauri-plugin-updater，装不了包，但「有新版本」这件事照样要说，
// 只是能做的动作不同（见 webAction）：
//   · 服务端版本 ≠ 页面里这份 SPA 的版本 → 浏览器缓存了旧 index.html，一键刷新即可；
//   · 已发布版本 > 服务端版本          → 得由管理员拉新镜像重启，前端只能给出指引。
// 版本真相取自与桌面端同一个 latest.json（自托管 Cloudflare 优先，回落 github 镜像），
// 所以两条分发线永远报同一个「最新版」。
// ─────────────────────────────────────────────────────────────
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri, backendVersion } from "../tauri";

// 后端 updater.rs 的 UpdaterState（serde tag = "status"）。
type UpdaterState =
  | { status: "disabled" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string; notes: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "installing"; version: string }
  | { status: "error"; message: string };

// 后端状态机的当前态（唯一真相源）。
const state = ref<UpdaterState>({ status: "idle" });

// ── 兼容旧契约：以下导出全部由 state 派生，消费组件（Banner/Panel）零改动 ──
export const currentVersion = ref<string>(""); // 当前已安装版本（前端取）
export const lastCheckedAt = ref<number | null>(null); // 上次检查时间戳(ms)
export const dialogDismissed = ref(false); // 中央对话框「以后再说」—— 纯前端态

const versionOf = (s: UpdaterState): string | null =>
  "version" in s ? s.version : null;

export const updateVersion = computed<string | null>(() => versionOf(state.value)); // 有值=有更新
export const remoteVersion = updateVersion; // 远程最新版本号（语义同上）
export const updateNotes = computed<string>(() =>
  state.value.status === "available" ? state.value.notes : "",
);
export const updating = computed(
  () => state.value.status === "downloading" || state.value.status === "installing",
);
export const updateProgress = computed(() => {
  const s = state.value;
  if (s.status === "downloading") return s.percent;
  if (s.status === "installing" || s.status === "ready") return 100;
  return 0;
});
export const updateError = computed(() =>
  state.value.status === "error" ? state.value.message : "",
);
export const checking = computed(() => state.value.status === "checking");
export const upToDate = computed(() => state.value.status === "up-to-date");
export const checkFailed = computed(() => state.value.status === "error");

// ── Web/Docker 分支 ────────────────────────────────────────────
// 这份 SPA 构建时打进去的版本（vite define，取自 package.json）。
const pageVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
// 服务端自报版本（/api/version）；拿不到就为空，此时只跟 pageVersion 比。
const serverVersion = ref("");

/**
 * 浏览器里「更新」到底该干什么。由 webCheck 判定后写入，桌面端恒为 null。
 *   reload  —— 服务端已经是新版了，只是这个标签页还跑着缓存的旧 SPA → 刷新即可，用户自己能完成。
 *   upgrade —— 服务端镜像本身旧了 → 只有管理员能升，前端给命令、不假装能一键搞定。
 *
 * 两者是独立的两件事，不能合并判断：服务端已经是最新版、但页面是缓存的旧版时，
 * 「已是最新」与「你该刷新」同时成立——只比 latest 会把这种最该提示的情况判成无事发生。
 */
export const webAction = ref<"reload" | "upgrade" | null>(null);

/** 升级 Docker 部署的命令，直接展示给管理员照抄。 */
export const webUpgradeHint =
  "docker compose pull && docker compose up -d";

/** "1.0.10" > "1.0.9"：逐段按数字比，避免字符串序把 10 判成小于 9。 */
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * 浏览器侧检查：与桌面端读同一份 latest.json（自托管优先，回落 github 镜像）。
 * 逐个端点试，任一成功即止；全失败则静默——Web 版拿不到更新信息不该打扰用户。
 *
 * 注：这里只读版本号、不验签，因为浏览器不会拿它去装任何东西，
 * 最坏后果是显示一个错的版本号；真正要验签的是桌面端的下载安装那一跳（updater.rs）。
 */
const WEB_ENDPOINTS = [
  // 与 tauri.conf.json > plugins.updater.endpoints 保持同一顺序、同一批地址。
  "https://pub-667c9f15cb424a8db14d7b4ef7bbb481.r2.dev/downloads/latest.json",
  "https://gh-proxy.com/https://github.com/wuli2025/teacher-agent/releases/latest/download/latest.json",
  "https://github.com/wuli2025/teacher-agent/releases/latest/download/latest.json",
];

async function webCheck(): Promise<void> {
  state.value = { status: "checking" };
  serverVersion.value = (await backendVersion()) || "";
  // 页面版本兜底：/api/version 拿不到时(旧服务端/未登录)退回构建期版本，
  // 至少「有没有更新」这个判断还成立。
  currentVersion.value = serverVersion.value || pageVersion;

  // ① 先判「页面陈旧」：这一步不碰网络、也与有没有发新版无关。
  // 服务端已经比这个标签页新 → 刷新就能吃到，优先提示，因为它是用户自己一键能解决的。
  if (serverVersion.value && pageVersion && isNewer(serverVersion.value, pageVersion)) {
    lastCheckedAt.value = Date.now();
    webAction.value = "reload";
    state.value = {
      status: "available",
      version: serverVersion.value,
      notes: "服务端已更新到新版本，刷新页面即可加载。",
    };
    return;
  }

  // ② 再判「服务端镜像陈旧」：拿已发布的最新版跟服务端比。
  for (const url of WEB_ENDPOINTS) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const j = (await r.json()) as { version?: string; notes?: string };
      if (!j.version) continue;
      lastCheckedAt.value = Date.now();
      if (isNewer(j.version, currentVersion.value)) {
        webAction.value = "upgrade";
        state.value = { status: "available", version: j.version, notes: j.notes || "" };
      } else {
        webAction.value = null;
        state.value = { status: "up-to-date" };
      }
      return;
    } catch {
      /* 换下一个端点 */
    }
  }
  webAction.value = null;
  state.value = { status: "error", message: "检查更新失败：所有更新源都不可达" };
}

let subscribed = false;
let autoChecked = false;

async function ensureCurrentVersion(): Promise<void> {
  if (currentVersion.value) return;
  try {
    currentVersion.value = await getVersion();
  } catch {
    /* 非 Tauri 运行时（纯浏览器预览）拿不到，忽略 */
  }
}

/** 订阅后端状态机：先拉一次快照，再 listen 增量。幂等。 */
async function ensureSubscribed(): Promise<void> {
  if (subscribed) return;
  subscribed = true;
  try {
    await listen<UpdaterState>("updater://state", (ev) => {
      state.value = ev.payload;
    });
    // 拉一次初始快照（可能在 listen 建立前就已被 init 设过 available）。
    state.value = await invoke<UpdaterState>("updater_get_state");
  } catch (e) {
    subscribed = false; // 非 Tauri 运行时：留待下次，静默
    console.warn("[updater] subscribe failed:", e);
  }
}

/**
 * 启动时调用一次：订阅 + 触发后端检查，发现新版即由 UpdateBanner 自动弹出。
 *
 * **冷启动重试**：开机那一刻网络常还没就绪 → 首次检查直接失败(error)，中央弹窗就不弹了，
 * 用户只能手动去「更新」页才看到。这里改成「渐进退避重试」——只要还没拿到确定结论
 * （发现新版 / 已最新），就隔几秒再试，直到网络恢复，保证「点开 app 就会弹」。
 */
export async function checkForUpdate(): Promise<void> {
  if (autoChecked) return;
  autoChecked = true;
  // Web/Docker：没有后端状态机可订阅，走浏览器侧的版本比对。
  // 同样推迟 5s 错峰，理由与桌面端一致（别抢开屏后的第一波请求）。
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 5000));
    await webCheck();
    return;
  }
  await ensureCurrentVersion();
  await ensureSubscribed();
  // 首查错峰推迟 5s（避开首帧 IPC 突发——启动检查更新不抢开屏后的第一波命令），
  // 随后 4s/12s/30s 退避重试（覆盖冷启动到网络就绪的常见窗口）。
  const delays = [5000, 4000, 12000, 30000];
  for (const wait of delays) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const st = await invoke<UpdaterState>("updater_check");
      lastCheckedAt.value = Date.now();
      // 已有确定结论(available=有更新会触发弹窗 / up-to-date=已最新)即收手；
      // 仅「检查失败」才继续退避重试。downloading/installing 也视为已在推进、收手。
      if (st.status !== "error") return;
    } catch (e) {
      console.warn("[updater] auto check failed, will retry:", e);
    }
  }
}

/** 用户在「更新」板块点「检查更新」：转发到后端（单飞），带 UI 反馈。 */
export async function manualCheck(): Promise<void> {
  dialogDismissed.value = false; // 手动检查后允许中央对话框再次出现
  if (!isTauri) {
    await webCheck();
    return;
  }
  await ensureCurrentVersion();
  await ensureSubscribed();
  try {
    await invoke("updater_check");
    lastCheckedAt.value = Date.now();
  } catch (e) {
    console.warn("[updater] manual check failed:", e);
  }
}

/**
 * 用户点主按钮。桌面端 = 后端下载 + 安装 + 自重启（进度由 updater://state 推送）；
 * Web 端 = 刷新页面（upgrade 情形没有可执行动作，按钮由 UI 隐掉，只留升级指引）。
 */
export async function applyUpdate(): Promise<void> {
  if (updating.value) return;
  if (!isTauri) {
    // 只有 reload 是浏览器自己能完成的动作；镜像升级得管理员上机器，这里不该假装能做。
    if (webAction.value === "reload") window.location.reload();
    return;
  }
  try {
    await invoke("updater_apply");
    // 正常路径里后端会自重启，不会走到这里。
  } catch (e) {
    console.warn("[updater] apply failed:", e);
  }
}

/** 「以后再说」：只关中央对话框，本次会话不再自动弹（板块入口仍在）。 */
export function dismissUpdate(): void {
  dialogDismissed.value = true;
}
