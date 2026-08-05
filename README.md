# user-front

`user-front` 是 Token NX 的用户端 Web 前端，面向普通用户和企业用户提供模型浏览、在线测试、API Key 管理、用量与账单查询、视频生成、企业空间管理等功能。

项目使用 React 19 + TypeScript + Vite 构建，前端页面通过 `/api`、`/v1` 接口与后端服务交互。认证状态使用 Redux 管理，业务页面按路由懒加载，测试使用 Vitest 和 Testing Library。

## 目录结构

```text
user-front/
├── src/
│   ├── api/          # HTTP 请求、认证、模型调用、账单和企业接口
│   ├── auth/         # 访问令牌、刷新令牌和跨标签页同步
│   ├── components/   # 通用布局、表单、图表、Markdown 等组件
│   ├── data/         # 用户端页面状态和模型数据
│   ├── i18n/         # 中文、英文文案和 API 错误消息
│   ├── pages/        # 公共页面、用户控制台和企业控制台页面
│   ├── store/        # Redux store 和认证状态切片
│   ├── test/         # Vitest 测试环境初始化
│   ├── utils/        # 格式化、模型筛选、快速接入等业务工具
│   ├── App.tsx       # 路由、认证初始化和页面懒加载入口
│   ├── main.tsx      # React 根节点和全局样式入口
│   └── styles.css    # 全局样式
├── index.html        # HTML 入口
├── vite.config.ts    # Vite 开发服务器、代理和构建配置
├── vitest.config.ts  # 测试环境、覆盖率范围和覆盖率门槛
└── package.json      # npm 脚本和依赖声明
```

## 环境要求

- Node.js `>=26.5.0`。
- npm `12.0.1`，版本声明见 `package.json` 的 `packageManager` 字段。
- 可访问的 Token NX 后端服务。默认本地后端地址为 `http://127.0.0.1:8081`，后端启动方式见 [`../thinkgo/README.md`](../thinkgo/README.md)。
- 推荐使用 Chromium 内核浏览器进行本地调试。

可以先确认本机版本：

```bash
node --version
npm --version
```

## 安装依赖

在仓库根目录执行：

```bash
cd user-front
npm ci
```

`npm ci` 根据 `package-lock.json` 安装锁定版本，适用于本地初始化、CI 和发布构建。修改依赖后应使用 npm 更新 `package.json` 与 `package-lock.json`，不要只修改其中一个文件。

## 环境变量

项目已经提供以下环境文件：

| 文件               | 使用场景        | 说明                                   |
| ------------------ | --------------- | -------------------------------------- |
| `.env.example`     | 配置参考        | 仅为模板，不会被 Vite 自动加载         |
| `.env.development` | `npm run dev`   | 开发模式配置                           |
| `.env.production`  | `npm run build` | 生产构建配置                           |


可配置变量如下：

| 变量                    | 作用                                                       | 默认/建议值                                            |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `VITE_API_BASE_URL`     | 非开发模式下的后端基础地址；模型调用会在此地址后追加 `/v1` | 生产环境填写可从浏览器访问的后端地址，开发环境通常留空 |
| `VITE_API_PROXY_TARGET` | Vite 开发代理目标，接收 `/api` 和 `/v1` 请求               | `https://api.firebulls.cn:8443`    测试环境后端接口地址                            |

注意事项：

1. Vite 只会把 `VITE_` 前缀变量暴露给浏览器，不能在其中放置数据库密码、私钥或其他服务端密钥。
2. 开发模式下，普通 API 请求会保持为同源的 `/api/...` 或 `/v1/...`，由 Vite 代理转发到 `VITE_API_PROXY_TARGET`，这样可以避免普通请求受到跨域限制。
3. 模型在线测试使用 `VITE_API_BASE_URL`、`VITE_API_PROXY_TARGET` 或 `https://api.firebulls.cn:8443` 解析真实后端地址，并直接请求该地址的 `/v1/chat/completions`。因此模型调用场景还要求浏览器能够访问后端，并由后端正确配置 CORS。
4. 修改环境文件后必须重新启动 Vite。环境变量在构建时写入前端静态资源，不能在页面运行期间动态读取服务器环境变量。

本地后端使用默认端口时，开发配置的核心内容可以是：

```dotenv
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=https://api.firebulls.cn:8443
```

## 编译、运行和预览

### 启动开发服务器

```bash
cd user-front
npm run dev
```

默认访问地址为 <http://127.0.0.1:5174>。Vite 配置固定使用：

- Host：`127.0.0.1`
- Port：`5174`
- 代理路径：`/api`、`/v1`
- 默认代理目标：`http://127.0.0.1:8081`

如果端口被占用，Vite 会按照自身规则尝试其他端口；以终端输出的地址为准。前端启动后，后端服务仍需单独运行。

### 类型检查

```bash
npm run typecheck
```

该命令执行 `tsc --noEmit`，只检查 `src` 和 Vite 配置涉及的 TypeScript 类型，不生成文件。`npm run build` 内部也会先执行 TypeScript 项目构建检查。

### 生产构建

```bash
npm run build
```

构建流程是 `tsc -b && vite build`，输出目录为 `dist/`。Vite 默认使用 production mode，并读取 `.env.production`。构建目标为 `es2022`，页面和公共依赖会进行代码分块，生产构建当前关闭 source map。

### 本地预览构建结果

```bash
npm run preview
```

该命令使用 Vite 预览 `dist/` 中的静态文件，默认地址通常为 <http://localhost:4173>。它用于验证生产构建结果，不会替代后端服务，也不会重新编译源代码。

## 测试与格式检查

```bash
# 执行全部单测
npm test

# 监听模式，适合开发过程中反复运行
npm run test:watch

# 执行单测并生成覆盖率报告
npm run test:coverage

# 检查 Prettier 格式
npm run format:check
```

测试配置位于 `vitest.config.ts`：

- 测试环境为 `jsdom`，初始化文件为 `src/test/setup.ts`。
- 测试文件匹配 `src/**/*.test.{ts,tsx}`。
- 覆盖率使用 V8，报告输出为终端文本和 `coverage/` HTML 报告。
- 当前覆盖率门槛为：行覆盖率 `80%`、函数覆盖率 `80%`、分支覆盖率 `75%`、语句覆盖率 `80%`。
- 覆盖率重点统计 `src/api`、`src/data`、`src/utils`、`src/components/support-chat.ts` 和账单页面等真实业务模块。

测试用例应优先覆盖 API 成功与失败、认证刷新、输入校验、路由跳转、权限分支和用户可见状态。测试代码不应通过无意义的重复断言来抬高覆盖率。

## 调试指南

### 浏览器调试

当前项目未提交独立的 VS Code 或 Chrome 启动配置，推荐使用开发服务器配合浏览器开发者工具：

1. 执行 `npm run dev`，打开终端显示的本地地址。
2. 在浏览器 DevTools 的 **Sources** 面板中打开 `src` 源文件并设置断点。开发模式使用 Vite 模块转换，修改代码后会自动更新页面。
3. 在 **Network** 面板检查请求 URL、请求方法、请求体、响应状态、响应体以及 `X-Request-ID`。
4. 在 **Console** 面板查看 React 渲染异常、路由异常、运行时错误和跨域错误。
5. 调试结束后删除临时 `debugger` 语句、日志和测试数据，避免将临时代码带入提交。

### API 请求排查

普通 API 请求统一经过 `src/api/http.ts`：

- 开发模式：请求地址通常显示为 `/api/...`，确认 Vite 终端是否收到代理请求，并检查 `VITE_API_PROXY_TARGET` 是否可访问。
- 非开发模式：请求地址来自 `VITE_API_BASE_URL`，检查构建时加载的 `.env.production` 是否正确。
- 所有请求会设置 `X-Request-ID` 和 `X-App-Lang`；把请求 ID 提供给后端日志查询，可以串联前后端问题。
- 认证请求失败会由 `src/api/authenticated.ts` 自动尝试刷新一次访问令牌。若持续收到 `401` 或认证错误码，检查登录状态、刷新令牌有效期和后端认证接口。

### 模型流式调用排查

在线测试和视频相关页面的模型请求不复用普通 API 的同源代理，而是直接访问真实后端地址：

```text
<后端基础地址>/v1/chat/completions
```

排查顺序建议如下：

1. 确认页面使用的 API Key、模型别名和消息内容不为空。
2. 检查 `VITE_API_BASE_URL` 或 `VITE_API_PROXY_TARGET` 解析出的地址是否能从当前浏览器访问。
3. 在 Network 面板确认响应类型是否为 `text/event-stream`，并检查流式响应是否持续返回 `data:` 事件。
4. 如果浏览器报告 CORS 或预检失败，检查后端对当前前端 Origin、`Authorization`、`Content-Type`、`X-Request-ID` 和 `X-App-Lang` 的允许配置。
5. 根据响应中的请求 ID、HTTP 状态和模型服务错误码继续查询后端日志。

### 认证和本地状态排查

用户端会使用浏览器存储保存部分页面状态和刷新会话。遇到登录状态、工作空间或本地演示数据异常时，可在 DevTools 的 **Application** 面板清理当前站点的 Local Storage、Session Storage 后重新加载页面。清理前应确认不会影响正在使用的其他本地登录会话。

主要存储项包括：

- `token-nx:auth:refresh:v1`：刷新会话信息。
- `token-nx:auth:device:v1`：设备标识。
- `token-nx:user-front:v1`：用户端页面配置和工作空间快照。
- `token-nx:theme`：主题模式。

访问令牌主要保存在当前页面内存中，并通过 `BroadcastChannel` 或 `storage` 事件同步认证变化。不要在控制台、截图或日志中暴露访问令牌、刷新令牌和 API Key。

### 生产构建调试

生产构建默认关闭 source map，因此生产页面不适合作为主要断点调试环境。生产问题应优先保留：

- 页面 URL 和操作步骤；
- 浏览器、系统和构建版本；
- Network 中的请求 URL、状态码、响应摘要和 `X-Request-ID`；
- Console 错误堆栈；
- 是否只发生在生产 API、特定账号、特定模型或特定企业空间。

如果确需对生产包进行源码级调试，应在受控构建流程中显式生成并保护 source map，不能把包含内部源码映射的文件公开部署。

## 外部库

依赖版本以 `package.json` 和 `package-lock.json` 为准。下面列出项目直接使用的主要外部库及用途。

### 运行时依赖

| 依赖                        | 版本       | 用途                                                               |
| --------------------------- | ---------- | ------------------------------------------------------------------ |
| `react` / `react-dom`       | `19.2.8`   | React 组件模型和浏览器渲染入口                                     |
| `react-router`              | `^8.3.0`   | 公共页面、用户控制台和企业控制台路由；配合 `lazy` 实现页面分块加载 |
| `@douyinfe/semi-ui`         | `2.101.1`  | 表单、表格、弹窗、布局、通知等 UI 组件；入口加载 React 19 适配层   |
| `@douyinfe/semi-icons`      | `2.101.1`  | Semi Design 图标                                                   |
| `@lobehub/icons-static-svg` | `^1.94.0`  | 模型厂商、合作伙伴和平台品牌 SVG 图标                              |
| `@reduxjs/toolkit`          | `^2.12.0`  | Redux store、认证 slice 和异步状态管理                             |
| `react-redux`               | `^9.3.0`   | React 组件连接 Redux store 的 Provider 和 hooks                    |
| `i18next`                   | `^26.3.6`  | 国际化资源和语言切换基础能力                                       |
| `react-i18next`             | `^17.0.11` | React 组件中的翻译 hooks 与渲染集成                                |
| `echarts`                   | `^6.1.0`   | 用量趋势和维度分布图表；当前使用折线图、柱状图和 SVG renderer      |
| `react-markdown`            | `^10.1.0`  | 将模型输出和文档内容渲染为 React Markdown                          |
| `remark-gfm`                | `^4.0.1`   | Markdown 表格、任务列表等 GitHub Flavored Markdown 语法            |
| `rehype-sanitize`           | `^6.0.0`   | 清理 Markdown HTML 节点，降低不可信内容注入风险                    |

### 开发和测试依赖

| 依赖                                                | 版本                   | 用途                                 |
| --------------------------------------------------- | ---------------------- | ------------------------------------ |
| `vite`                                              | `8.1.5`                | 开发服务器、依赖预构建和生产打包     |
| `@vitejs/plugin-react`                              | `6.0.4`                | Vite 的 React/JSX 编译和开发体验支持 |
| `typescript`                                        | `7.0.2`                | 类型检查和项目构建检查               |
| `vitest`                                            | `4.1.10`               | 单元测试和组件测试运行器             |
| `@vitest/coverage-v8`                               | `4.1.10`               | 基于 V8 的覆盖率采集和报告           |
| `@testing-library/react`                            | `16.3.2`               | React 组件测试渲染和查询             |
| `@testing-library/user-event`                       | `14.6.1`               | 模拟用户点击、输入和键盘操作         |
| `@testing-library/jest-dom`                         | `7.0.0`                | DOM 断言扩展                         |
| `jsdom`                                             | `30.0.1`               | Vitest 中的浏览器 DOM 模拟环境       |
| `prettier`                                          | `3.9.6`                | 代码和配置格式检查                   |
| `@types/node` / `@types/react` / `@types/react-dom` | 以 `package.json` 为准 | TypeScript 类型声明                  |

## 关键配置

- `vite.config.ts`：配置 `@` 指向 `src` 的路径别名、开发服务器地址、API 代理、构建目标和构建告警处理。
- `vitest.config.ts`：配置 jsdom、测试初始化、测试文件范围和覆盖率门槛。
- `tsconfig.app.json`：配置应用源码的严格 TypeScript 检查和 `@/*` 路径别名。
- `tsconfig.node.json`：配置 Vite 配置文件的 TypeScript 检查。
- `src/api/http.ts`：统一处理 API 地址、超时、请求 ID、认证请求头和错误响应。
- `src/api/model-runtime.ts`：处理 `/v1/chat/completions` 的普通响应和 SSE 流式响应。
- `src/auth/token-storage.ts`：处理认证令牌持久化、并发刷新协同和跨标签页同步。
- `src/App.tsx`：维护路由表、登录态守卫、页面懒加载和应用启动加载层。

## 常用工作流

提交前建议至少执行：

```bash
npm run format:check
npm run typecheck
npm test
npm run build
```

涉及 API、认证、权限、支付、用量、企业空间或模型流式调用时，应同时运行 `npm run test:coverage`，并检查覆盖率没有突破配置中的门槛。
