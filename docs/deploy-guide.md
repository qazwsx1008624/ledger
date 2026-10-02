# 部署到手机 · 手把手教程

目标：把记账本部署到 GitHub Pages（免费、HTTPS），让手机能像 App 一样使用。
全程约 15 分钟，只需做一次；之后改代码推送会自动更新。

> 准备工作：一个 GitHub 账号、电脑已装 Git（本机已装）、手机能上外网。
> 提示：GitHub Pages 免费版要求仓库**公开**。本仓库只含代码，不含任何个人数据（账目都在浏览器里），可以放心公开。

---

## 第 1 步：在 GitHub 创建仓库（网页操作）

1. 打开 https://github.com 并登录
2. 点右上角 **+** → **New repository**
3. 填写：
   - Repository name：`ledger`（或任何名字，如 `jizhangben`）
   - 选 **Public**（公开，必须）
   - 下面三个勾选框（README / .gitignore / license）**全部不要勾**，保持空仓库
4. 点绿色 **Create repository** 按钮
5. 记下这个地址（后面要用）：`https://github.com/<你的用户名>/<仓库名>.git`

## 第 2 步：开启 Pages（网页操作，先做这步再推送）

1. 在新仓库页面顶部，点 **Settings**（齿轮标签）
2. 左侧菜单拉到底，点 **Pages**
3. 找到 **Build and deployment** 一栏：
   - **Source** 下拉框选 **GitHub Actions**
4. 关掉设置页。这步会让第 4 步的自动部署一次成功。

## 第 3 步：把本地代码推上去（电脑终端）

在电脑上打开终端（开始菜单搜 `PowerShell`），**逐行**执行下面命令。
注意把网址换成你第 1 步记下的地址：

```powershell
cd D:\dsh-files
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> ⚠️ 如果你用的是 **cmd**（黑窗口）而不是 PowerShell，切换目录要写成 `cd /d D:\dsh-files`；
> 在 **PowerShell** 里写成 `cd /d D:\dsh-files` 会报
> `Set-Location: 找不到接受实际参数“D:\dsh-files”的位置形式参数`——不要加 `/d`。

执行 `git push` 时：

- **正常情况**：会弹出浏览器窗口让你登录 GitHub → 点授权 → 回到终端自动继续上传
- 如果没弹窗、而是命令行要求输入密码：
  - 用户名填你的 GitHub 用户名
  - 密码填 **Personal Access Token**（生成方法见文末附录 A）

上传成功后，终端会显示类似 `* [new branch] main -> main`。

## 第 4 步：等自动部署完成

1. 打开你的仓库网页 → 顶部点 **Actions** 标签
2. 会看到一个叫 **Deploy to GitHub Pages** 的工作流在跑（黄色圆点）
3. 约 2-3 分钟后变成绿色 ✓ 即成功
   - 如果变红 ✗：点进去看报错，把错误信息发给我
4. 成功后，打开 `https://<你的用户名>.github.io/<仓库名>/`
   - 应该看到记账本界面（全新空账本，这是正常的）
5. **先在电脑浏览器里试一下**：记一笔账 → 刷新页面 → 账还在，说明手机版环境正常

## 第 5 步：手机上装成 App

**安卓（Chrome 浏览器）：**

1. 手机 Chrome 打开上面的网址
2. 等页面完全加载出来（第一次稍慢，耐心等）
3. 点右上角 **⋮** 菜单 → 点 **安装应用**（或「添加到主屏幕」）
4. 桌面出现「记账本」图标，点它打开就是全屏 App，**断网也能用**

**iPhone（Safari）：**

1. Safari 打开上面的网址，等加载完成
2. 点底部 **分享** 按钮（方框带向上箭头）
3. 菜单往下滑，点 **添加到主屏幕**
4. 右上角 **添加** → 桌面出现图标

## 第 6 步：把电脑上已有的账搬过去

1. 电脑打开本地记账本 `http://localhost:5173` → 管理 → 数据备份 → **导出备份**
   → 下载得到 `ledger-日期.sqlite` 文件
2. 把这个文件发给微信「文件传输助手」
3. 手机上微信里点开这个文件下载
   - 安卓：微信会自动下载，文件通常在「下载」目录
   - iPhone：点右上角 … → 存储到「文件」
4. 手机打开记账本 App → 管理 → 数据备份 → **导入并合并** → 选择刚才的文件
5. 完成 ✅ 电脑的账全在手机上了

## 第 7 步：以后怎么日常用

- **记账主力在手机**，离线也能记
- **定期同步**（建议每周一次，防患于未然）：
  1. 手机：管理 → 导出备份 → 发微信文件传输助手
  2. 电脑：管理 → **导入并合并**（千万用「合并」，不要用「覆盖导入」）
- 两边各自新记的账都会保留，同一条账取最新修改，不会互相覆盖

## 以后代码更新

改完代码后 `git commit` + `git push`，GitHub 自动重新部署。
手机 App 打开一次会自动更新（Service Worker 后台拉取，下次刷新生效）。

---

## 附录 A：生成 Personal Access Token（只有 push 没弹登录窗口时才需要）

1. GitHub 网页 → 右上角**头像** → **Settings**
2. 左侧最底 → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token** → **Generate new token (classic)**
5. Note 随便填（如 `push`）；Expiration 选 90 天
6. 勾选 **repo** 这一大项
7. 拉到最下点 **Generate token**
8. **立刻复制**那串 `ghp_` 开头的字符（离开页面就看不到了）
9. 回到终端 push 时：用户名填 GitHub 用户名，密码粘贴这串字符

## 附录 B：常见问题

| 现象 | 处理 |
| --- | --- |
| push 报 `403` / `Authentication failed` | 用附录 A 的 Token 当密码 |
| 第 4 步网址打开 404 | 部署还没完成，等几分钟刷新；或检查第 2 步的 Source 是否选了 GitHub Actions |
| Actions 里 deploy 失败 | 把报错截图发给我 |
| 手机上页面空白 | 手机浏览器太旧（需 Chrome 108+ / Safari 16.4+）；或还没加载完就切走了 |
| 手机「添加到主屏幕」后打开是旧的/空白 | 卸载图标重新添加；确保第一次添加前页面已完全加载 |
| 手机和电脑数据对不上 | 正常，它们是两份独立账本，靠「导出 + 导入并合并」同步 |
