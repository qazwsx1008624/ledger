# 生活费记账本

大学生活费记账工具。数据存在本机浏览器里的 SQLite 中，不依赖任何后端服务，账目不出本机。

## 运行

```bash
cd ledger
pnpm install
pnpm dev
```

然后打开 **http://localhost:5173**。

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm start` | 用零依赖静态服务器伺服构建产物（沙箱内可用的替代方案） |
| `pnpm typecheck` | 只做类型检查 |
| `pnpm test` | 运行测试 |

> `pnpm dev`、`pnpm build`、`pnpm test` 在本机 DSH 沙箱内都会失败：Vite 在 Windows 上做路径校验时会 spawn 子进程，而该处**没有 try/catch**，受限沙箱下直接抛 `EPERM`。请在项目目录下用自己的终端运行，与项目代码无关。详见文末「环境上的坑」。

## 数据存在哪里

- 数据库是浏览器 OPFS 中的 `ledger.sqlite3`（`opfs-sahpool` VFS），**刷新、关浏览器、重启电脑都不丢**。
- 但 OPFS 按「协议 + 主机 + 端口」隔离：**换端口等于换一个空账本**，所以端口固定 5173，请始终用同一个地址打开。
- 换浏览器 / 清空站点数据会丢掉账本。**管理页 → 数据备份**可导出 `.sqlite` 文件，换环境前务必导出；导入即可恢复。
- 同一时间只允许一个标签页打开本账本（存储引擎单连接限制），多开会看到明确提示。
- 启动时会做**一致性检查**：若本地为空但历史上有过备份记录，会在页面顶部明确提示你导入备份，而不是假装一切正常。

## 数据安全现状

**已实现：** SQLite 持久化、手动导出 `.sqlite`、导入恢复、启动一致性检查、软删除 + 回收站。

**尚未实现（下一阶段）：** 自动备份到文件夹（File System Access API 选目录，仅 Chrome/Edge 支持）、`.xlsx` 导出。在此之前请养成手动导出的习惯。

## 核心口径

三条不变的口径，均由测试守住（`src/core/*.test.ts`）：

```
净支出 = 正常支出 − 退款
可存下 = 收入 − 净支出
分类占比 = 该分类净额 ÷ 本月净支出        （退款抵扣所属分类）
```

其它约定：

- **金额一律以整数「分」存储与运算**，只有渲染时才换算成元。浮点数不能用于金额。
- **不允许负数金额。** 方向完全由类型决定（退款靠 `isRefund` 标记表达，不靠负号）。这条能从结构上杜绝「负数支出」与「退款」两个含义互相打架。
- **软删除的账目不得计入任何统计。** 所有统计查询都必须先过滤 `deletedAt`。
- **「用途待补充」不是普通分类，而是一个待补充状态。** 它照常计入总支出（钱确实花了），但在分类表里单独呈现，并作为待办事项显示在主界面。

## 交互设计要点

界面为**顶部导航 + 四个页面**：

- **记账**：录入（默认今天 + 支出、光标在金额框、回车保存、保存后清空可连续记、分类胶囊、昨天/前天快捷键）+ 最近几笔（点开即可改）
- **今日**：当日支出 + 当日账单，日期可点开日历选择、可前后翻；**任意一天、任意一笔都能点开修改或删除**；当日账单按时间先后排列
- **本月**：本月支出（收入/退款/可存下）、预期对比、「用途待补充」入口、分类占比（点分类下钻明细）、「本月账单」折叠区（按金额从高到低）
- **管理**：本月预期花销的设置与清除、分类增删改与排序（删除分类时其下账目一并删除、可恢复）、回收站、数据备份（导出/导入/演示数据）

其它要点：

- 所有账目编辑统一走**底部滑出的编辑面板**，删除需要双击确认，删除后显示「撤销」提示条
- 删除为软删除：不计入统计，回收站可恢复
- **用途待补充**不是普通分类，而是待补充状态：按金额从大到小逐笔过，数字键 1–9 归类、Esc 跳过（想不起来就先放着，不能逼用户瞎选一个分类）
- 统计全部由纯函数聚合得出（`src/core/stats.ts`），不把明细拉到前端累加
- 管理页「载入演示数据」会清空现有账目并生成相对今天的约两周模拟记录，仅用于体验

## 项目结构

```
ledger/
├── index.html
├── vite.config.ts            # worker 用 ES 格式；端口固定 5173
├── vitest.config.mts
├── pnpm-workspace.yaml       # pnpm 供应链策略与 hoisted 布局（见文末）
├── scripts/
│   └── serve-dist.mjs        # 零依赖静态服务器，用于沙箱内预览构建产物
└── src/
    ├── main.tsx
    ├── App.tsx               # 壳：底部导航、编辑面板、撤销提示
    ├── styles.css            # ins 风视觉
    ├── core/                 # 纯逻辑，不依赖 DOM，全部可测
    │   ├── types.ts          # 数据模型
    │   ├── money.ts          # 金额分/元换算与日期工具
    │   ├── stats.ts          # 统计口径（净支出、分类占比、今日净支出）
    │   ├── categories.ts     # 分类增删改与删除迁移
    │   ├── store.ts          # 演示用内存数据源 + 内置模拟数据
    │   ├── money.test.ts
    │   ├── stats.test.ts
    │   └── categories.test.ts
    ├── ui/                   # 页面与共享组件
    │   ├── kit.tsx           # 图标、分段选择、金额展示
    │   ├── EntryPage.tsx     # 记账页（录入 + 最近几笔 + 账单行组件）
    │   ├── TodayPage.tsx     # 今日页（当日支出 + 当日账单）
    │   ├── MonthPage.tsx     # 本月页（月支出 + 分类占比 + 待补充入口）
    │   ├── ManagePage.tsx    # 管理页（预期花销 + 分类管理 + 回收站）
    │   ├── TriagePage.tsx    # 用途待补充 · 快捷键逐笔归类
    │   ├── TxEditor.tsx      # 底部滑出的账目编辑面板
    │   └── TabBar.tsx        # 底部胶囊导航
    └── db/                   # SQLite 数据层（已实现，尚未接入，见上文）
        ├── protocol.ts
        ├── ledger.worker.ts
        └── ledger-client.ts
```

## 技术选型

Vite 8 + React 19 + TypeScript 7（严格模式，开启 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）。

数据库将使用 `@sqlite.org/sqlite-wasm` 的官方 **`opfs-sahpool` VFS**，几条硬性约束：

| 约束 | 原因 |
| --- | --- |
| 数据库必须跑在**专用 Web Worker** 中 | OPFS 的同步访问句柄 `FileSystemSyncAccessHandle` 只在专用 Worker 中可用，主线程拿不到 |
| 主线程只能通过客户端模块调用数据库 | 不要在 React 组件里直接用 SQLite |
| 选 `opfs-sahpool` 而非默认的 `opfs` VFS | 前者**不需要 COOP/COEP 响应头**；后者需要 SharedArrayBuffer，因而需要跨源隔离。代价是同一时间只允许一个连接 |
| **绝不能设置 `clearOnInit: true`** | 官方 sahpool 演示里设成了 `true`，那会导致**每次刷新页面清空数据库**。这是最容易踩的坑 |
| 端口固定 5173（dev 与 preview 一致） | OPFS 按「协议 + 主机 + 端口」隔离，换端口等于换一个空数据库，会让用户以为数据丢了 |
| Worker 使用 ES module 格式 | 需 `worker: { format: 'es' }` 以匹配 `new Worker(url, { type: 'module' })` |

## 数据安全（尚未实现）

用户要求「不能丢数据」。浏览器存储无法做到绝对不丢，计划靠多层设计把风险降到最低：

1. **自动备份到真实文件夹**：用 File System Access API 选定目录后，每次变动自动写入。仅 Chrome / Edge 支持。
2. **启动一致性检查**：对比本地笔数与备份清单记录的笔数，发现本地为空而备份有记录时，提示一键恢复。这是防「静默丢失」的关键。
3. **双格式导出**：`.sqlite`（完整恢复）与 `.xlsx`（Excel 直接打开）。
4. **界面显示「距上次成功备份多少天」**，不藏在设置里。

## 环境上的坑

**1. `pnpm-workspace.yaml` 里为什么用 `nodeLinker: hoisted`。**
本机 pnpm 11.7.0 使用默认的隔离式布局创建链接时会抛 `[ERR_PNPM_SYMLINK_FAILED] Maximum call stack size exceeded`，并留下指向空目标的**悬空链接**，而 pnpm 仍按锁文件认为安装已完成、不会自动修复。受影响的是 `rolldown`、`lightningcss`、TypeScript 的原生二进制，表现为 `vite` / `tsc` 直接启动失败。改成提升式布局可绕开。

同文件中的 `minimumReleaseAgeExclude` 是对 pnpm 供应链策略（默认拒绝发布未满 24 小时的版本）的定向豁免，只放行本项目工具链必需且发布尚新的包，不关闭整体门槛。

**2. 在 DSH 沙箱内无法启动开发服务器、构建或跑测试。**
Vite 在 Windows 上做路径校验时会调用 `exec("net use", ...)`，而它对 spawn 失败**没有 try/catch**（`vite/dist/node/chunks/node.js` 的 `optimizeSafeRealPathSync`）。受限沙箱下无法打开命名管道，spawn 同步抛 `EPERM`，直接中断。`pnpm dev`、`pnpm build`、`pnpm test` 都受影响（vitest 内部也走 Vite）。在项目目录下用自己的终端运行即可，与项目代码无关。

若在有沙箱但允许子进程的环境里跑测试，Vite 还会往系统临时目录写中间产物；`vitest.config.mts` 已把 `cacheDir` 指到工作区内的 `.cache/`。若仍报临时目录写入失败，把 `TEMP` / `TMP` 也指向工作区内目录即可。

## 需求文档

完整需求见仓库根目录的 `docs/requirements.md`。
