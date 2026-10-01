# 记账本

本地使用的记账工具。数据存在**浏览器内的 SQLite 数据库**里，不依赖任何后端服务，账目不出本机。

## 运行

```bash
cd ledger
pnpm install
pnpm dev
```

然后用浏览器打开 **http://localhost:5173**。

> 端口被固定在 5173（`strictPort`）。原因见下方「数据存在哪里」，请务必用这个地址访问。

其他命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 类型检查 + 生产构建，产物在 `dist/` |
| `pnpm preview` | 预览生产构建（同样固定在 5173） |
| `pnpm typecheck` | 只做类型检查 |

## 技术选型

- **Vite 8 + React 19 + TypeScript 7**（严格模式，开启 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）
- **SQLite via `@sqlite.org/sqlite-wasm`**，使用官方的 `opfs-sahpool` VFS

几个关键决定及其原因：

**为什么数据库跑在 Web Worker 里。** OPFS 的同步访问句柄 `FileSystemSyncAccessHandle` 只在专用 Worker 中可用，主线程拿不到。所以 `src/db/ledger.worker.ts` 持有数据库，主线程通过 `src/db/ledger-client.ts` 发消息调用。这条是硬性约束，不是架构偏好。

**为什么选 `opfs-sahpool` 而不是默认的 `opfs` VFS。** `opfs` VFS 需要 `SharedArrayBuffer`，因而需要服务端下发 COOP/COEP 响应头（跨源隔离）。`opfs-sahpool` 不需要任何响应头，且按[官方文档](https://sqlite.org/wasm/doc/trunk/persistence.md)是各 OPFS 方案中性能最好的。代价是同一时间只允许一个连接占用数据库——第二个标签页打开会失败并给出明确提示，这对单机记账没有影响。

**为什么金额用「分」存整数。** 浮点数做金额运算会出现 `0.1 + 0.2 !== 0.3` 这类误差。库里存 `amount_cents INTEGER`，只在渲染时转成元（见 `src/lib/money.ts`）。

**注意 `clearOnInit` 必须保持 `false`。** 官方的 sahpool 演示里这个选项设成了 `true`，那会导致每次刷新页面都清空数据库。代码里对此有注释标注。

## 数据存在哪里

数据库文件是浏览器 OPFS 中的 `ledger.sqlite3`（VFS 目录 `/ledger-vfs`）。

- OPFS 按「协议 + 主机 + 端口」隔离。**换端口就是另一个空数据库**，所以 dev 与 preview 的端口都被钉在 5173。
- 同一时间只允许一个标签页打开本账本；重复打开会看到明确提示而不是静默出错。
- 应用启动时会调用 `navigator.storage.persist()` 申请持久化存储。若浏览器未授予，界面会提示，建议定期导出备份。
- 数据只存在这台机器的这个浏览器里。**不要用无痕模式**，浏览器清理站点数据会一并删掉账本。

**备份：** 界面底部「导出备份」会下载一个 `ledger-YYYY-MM-DD.sqlite` 文件，可直接用 DB Browser for SQLite 等工具打开查看，也可作为长期存档。

## 当前功能

- 记录收入 / 支出，字段：日期、金额、分类、备注
- 按月份查看，上月 / 下月 / 回到本月切换
- 按分类筛选明细
- 收入、支出、结余、笔数的月度汇总（用 SQL 聚合，不把明细拉到前端累加）
- 编辑与删除已有账目
- 导出 `.sqlite` 备份文件

预置分类在首次建库时写入（`ledger.worker.ts` 的 `SEED_CATEGORIES`），之后不会覆盖改动。分类的增删改界面尚未实现。

## 项目结构

```
ledger/
├── index.html
├── vite.config.ts          # worker 用 ES 格式；端口固定
├── pnpm-workspace.yaml     # pnpm 供应链策略与 hoisted 布局（见下）
└── src/
    ├── main.tsx
    ├── App.tsx             # 界面与交互
    ├── styles.css
    ├── types.ts
    ├── lib/money.ts        # 金额「分/元」换算与日期工具
    └── db/
        ├── protocol.ts       # 主线程 ↔ Worker 消息类型
        ├── ledger.worker.ts  # SQLite：建表、种子分类、增删改查、导出
        └── ledger-client.ts  # 把 postMessage 包装成可 await 的调用
```

## 本机环境上的两个坑

**1. `pnpm-workspace.yaml` 里为什么用 `nodeLinker: hoisted`。**
本机 pnpm 11.7.0 使用默认的隔离式（符号链接）布局创建链接时会抛 `[ERR_PNPM_SYMLINK_FAILED] Maximum call stack size exceeded`，并留下指向空目标的**悬空链接**，而 pnpm 仍按锁文件认为安装已完成、不会自动修复。受影响的是 `rolldown`、`lightningcss`、TypeScript 的原生二进制，表现为 `vite` / `tsc` 直接启动失败。改成提升式布局可绕开该缺陷。

同文件中的 `minimumReleaseAgeExclude` 是对 pnpm 供应链策略（默认拒绝发布未满 24 小时的版本）的定向豁免，只放行本项目工具链必需且发布尚新的包，不关闭整体门槛。

**2. 在 DSH 沙箱内无法启动开发服务器。**
Vite 在 Windows 上做路径校验时会调用 `exec("net use", ...)`，而它对 spawn 失败**没有 try/catch**（`vite/dist/node/chunks/node.js` 的 `optimizeSafeRealPathSync`）。受限沙箱下无法打开命名管道，spawn 同步抛 `EPERM`，直接导致 `pnpm dev` 与 `pnpm build` 中断。在项目目录下用自己的终端直接运行即可，与项目代码无关。
