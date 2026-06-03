# 📊 AI 数据分析助手

> 🥔 土豆大王 制作 · v1.0.0
>
> 上传 CSV / Excel 文件，自动分析数据、生成图表、获取 AI 洞察结论。
> 免费 · 开源 · 支持 Windows 桌面版 + 网页版

---

## ✨ 功能特性

- **文件上传**：拖拽或点击上传 CSV、XLSX、XLS 格式文件
- **数据概览**：自动识别列类型、统计缺失值、计算均值 / 中位数 / 标准差
- **智能图表**：根据数据类型自动生成分布直方图、分类柱状图、散点图、相关性热力图
- **AI 分析**：调用大语言模型，从数据质量、统计发现、业务洞察等维度给出专业结论
- **追问对话**：针对数据自由提问，AI 结合数据上下文回答
- **兼容广泛**：支持 OpenAI、DeepSeek、通义千问等所有兼容 OpenAI 格式的 API

---

## 🚀 使用方法

### 方式一：下载 Windows 便携版（推荐）

1. 进入 [Releases](https://github.com/your-username/ai-data-analyzer/releases) 页面
2. 下载 `AI数据分析助手-1.0.0-便携版.exe`
3. 双击运行，无需安装

### 方式二：从源码运行桌面版

需要 [Node.js](https://nodejs.org/) 18 或更高版本。

```bash
# 克隆仓库
git clone https://github.com/your-username/ai-data-analyzer.git
cd ai-data-analyzer

# 安装依赖
npm install

# 启动桌面应用
npm start
```

### 方式三：本地网页版

```bash
# 克隆仓库后，用任意 HTTP 服务器打开
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

### 方式四：GitHub Pages 在线版

1. Fork 本仓库
2. 进入 Settings → Pages → Source 选择 `GitHub Actions`
3. 推送代码后自动部署到 `https://your-username.github.io/ai-data-analyzer/`

---

## 📖 使用步骤

### 第 1 步：配置 API

点击右上角 **⚙️ API 设置** 按钮，填入：

| 字段 | 说明 | 示例 |
|------|------|------|
| API Key | 你的 API 密钥 | `sk-xxx` |
| Base URL | API 地址 | `https://api.openai.com/v1` |
| 模型名称 | 使用的模型 | `gpt-4o` |

设置保存在浏览器本地，不会上传到任何服务器。

**常见 API 服务商配置：**

| 服务商 | Base URL | 模型示例 |
|--------|----------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 月之暗面 | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` |

### 第 2 步：上传数据

- **拖拽上传**：将 CSV 或 Excel 文件拖到上传区域
- **点击上传**：点击上传区域选择文件
- **示例数据**：点击「加载示例数据」快速体验

### 第 3 步：查看分析结果

上传后自动跳转到 **数据概览** 标签页，包含：

- **📋 数据概览**：行数、列数、每列的类型、缺失值、统计摘要、数据预览
- **📊 可视化**：自动生成的分布图、柱状图、散点图、相关性热力图
- **🤖 AI 分析**：点击「开始 AI 分析」获取 AI 给出的专业结论
- **💬 追问**：针对数据自由提问，AI 结合数据上下文回答

---

## 🔨 自行打包 Windows exe

```bash
# 安装依赖
npm install

# 打包便携版 exe（免安装）
npm run dist

# 打包 NSIS 安装包
npm run dist:installer
```

打包产物在 `dist/` 目录下。

---

## 📁 项目结构

```
├── main.js              # Electron 主进程
├── preload.js           # Electron 预加载脚本
├── package.json         # 项目配置
├── index.html           # 主页面
├── style.css            # 样式
├── app.js               # 核心逻辑
├── favicon.svg          # 图标
├── sample/
│   └── demo.csv         # 示例数据
├── .github/
│   └── workflows/
│       └── pages.yml    # GitHub Pages 自动部署
├── .gitignore
├── LICENSE              # MIT 许可证
└── README.md            # 本文件
```

---

## 🛠 技术栈

| 模块 | 技术 |
|------|------|
| 桌面框架 | [Electron](https://www.electronjs.org/) |
| 页面结构 | 原生 HTML5 |
| 样式 | 原生 CSS3（响应式） |
| 交互逻辑 | 原生 JavaScript（无框架） |
| CSV 解析 | [PapaParse](https://www.papaparse.com/) |
| Excel 解析 | [SheetJS](https://sheetjs.com/) |
| 图表渲染 | [Chart.js](https://www.chartjs.org/) |
| Markdown 渲染 | [marked](https://marked.js.org/) |
| AI 接口 | OpenAI 兼容 API（fetch 直连） |

---

## 📄 许可证

[MIT License](LICENSE) - 自由使用、修改和分发

---

**🥔 土豆大王 制作**
