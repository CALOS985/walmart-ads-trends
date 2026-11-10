# 开发与发布 · Development

仓库根目录是可直接部署的静态成品，`source/` 是对应的可编辑源码。
使用看板或部署现成文件不需要 Node.js；修改功能时才需要安装以下环境。

## 本地开发

需要 Node.js 22.13 或更高版本，以及 pnpm 11.25.0。

```bash
cd source
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开 Vite 显示的本地地址。全部 CSV 解析在浏览器内完成。

## 构建

```bash
cd source
pnpm typecheck
pnpm test
pnpm build
```

产物在 `source/dist/`。静态部署时将这个目录内的全部文件上传到网站目录。
`base: "./"` 与模板相对链接应保留，保证包含空格的子目录也可使用。

仓库根目录的 `index.html` 是已经构建的入口；`source/index.html` 是开发入口，不能直接上传作为生产页面。

## 文件检查和打包

在仓库根目录运行（Python 3.10+，仅用标准库）：

```bash
python scripts/verify_publication.py
python scripts/package_release.py
```

`release/walmart-ads-trends-v1.2.3-static.zip` 直接使用仓库根目录的已构建成品。
源码修改并构建后，用以下命令打包新产物：

```bash
python scripts/package_release.py --site-dir source/dist
```

同时生成 `SHA256SUMS.txt`。上传静态 ZIP 和该校验文件到 GitHub Release；GitHub 自带的 Source code 下载包含完整仓库源码。

重新发布前，将 `source/dist/` 中的 `index.html`、`assets/`、`templates/`、`favicon.png`、`favicon.svg`、`og.png` 同步回根目录的对应位置，并更新版本和 CHANGELOG。源码目录的依赖安装与构建产物不提交。

## 项目结构

- `source/app/page.tsx`：CSV 解析、筛选、指标与主看板。
- `source/app/placement-charts.tsx`：广告版位饼图和柱状图。
- `source/app/globals.css`：界面与响应式样式。
- `source/src/main.tsx`：React 入口。
- `source/public/templates/`：可下载模板，与根目录 `templates/` 相同。

本仓库不需要服务端、数据库、Sites 配置或 Worker 即可运行。

## English

The root contains the ready-to-host static site. Editable React / TypeScript code is under `source/`.
Use Node.js 22.13+ and pnpm 11.25.0, then run `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm build` inside `source/`.
Deploy the contents of `source/dist/`, or package them with `python scripts/package_release.py --site-dir source/dist` from the repository root. Keep the relative Vite base path and template links.

## V1.2.0 对比与导入模块

- `source/app/analytics.ts`：共享指标、汇总与格式化。
- `source/app/csv.ts`：按表头名称解析 CSV，校验缺失 / 重复字段。
- `source/app/comparison.ts`：纯函数日期区间、逐 Item 汇总、差值与变化率。
- `source/app/period-comparison.tsx` / `.css`：时间段对比界面。
- `source/tests/analytics.test.ts`：列序变化、加权比率、跨月日期、零基期与缺失数据等逻辑测试。

## V1.2.2 指标说明模块

- `source/app/metric-definitions.ts`：指标来源、公式与说明。
- `source/app/metric-guide.tsx` / `.css`：页脚折叠说明与卡片入口样式。
- 完整口径文字见 [METRICS.md](METRICS.md)。
