# Deep-Trace 部署指南

## 环境要求

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose（容器部署）
- Git

---

## 一、本地开发模式

### 1. 克隆项目

```bash
git clone https://github.com/AlbertWill/deep-trace
cd deep-trace
```

### 2. 配置环境变量

```bash
cp agent/.env.example agent/.env
```

编辑 `agent/.env`，至少配置以下内容：

```bash
# LLM 提供商（取消注释其中一个）
LANGCHAIN_PROVIDER=openrouter
LANGCHAIN_MODEL_NAME=deepseek/deepseek-v4-pro
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# 数据源（可选）
TUSHARE_TOKEN=your-tushare-token
```

### 3. 启动后端

> Python 版本要求：3.11 或 3.12

```bash
# 创建虚拟环境（在项目根目录执行）
python3.12 -m venv agent/.venv
source agent/.venv/bin/activate
pip install --upgrade pip

# 安装依赖
pip install -e ".[dev]"

# 启动 API 服务（默认端口：8888）
deep-trace serve --port 8888
```

#### 停止后端服务

```bash
deep-trace stop
```

#### 重启后端服务

```bash
deep-trace restart
```

> `Ctrl+C` 可能无法干净退出（uvicorn 子进程会残留），建议使用 `deep-trace stop` 命令。

<details>
<summary>macOS 用户：llvmlite 编译失败的处理方式</summary>

依赖 `smartmoneyconcepts` → `numba` → `llvmlite` 在 **macOS 上没有预编译 wheel**，
pip 会尝试从源码编译，要求本地安装 LLVM 20 且版本精确匹配，容易失败。

**影响范围：** 仅影响 SMC（Smart Money Concepts）信号技能，核心功能不受影响。

**解决方法：** 跳过 `smartmoneyconcepts` 的 `numba` 依赖即可：

```bash
# 1. 安装除 smartmoneyconcepts 以外的所有依赖
grep -v "smartmoneyconcepts" agent/requirements.txt | pip install -r /dev/stdin

# 2. 安装项目本身（不自动装依赖）
pip install -e ".[dev]" --no-deps

# 3. 单独安装 smartmoneyconcepts，跳过其 numba/llvmlite 依赖
pip install smartmoneyconcepts --no-deps
```

**为什么 Linux/Docker 不受影响：** `llvmlite` 官方只为 Linux 提供预编译 wheel，macOS 上最高只到 `0.43.0`，
而 `numba>=0.58.1` 要求 `llvmlite>=0.47.0`。

</details>

### 4. 启动前端

```bash
cd frontend && npm ci && npm run dev
```

访问 http://localhost:5173 即可使用。

### 5. 交互式 CLI

```bash
source agent/.venv/bin/activate
deep-trace
```

---

## 二、Docker 部署

### 1. 配置环境变量

```bash
cp agent/.env.example agent/.env
# 编辑 agent/.env，配置 LLM API Key 等必要参数
```

### 2. 构建镜像

```bash
docker build -t deep-trace:latest .
```

### 3. 启动服务

```bash
docker compose up -d
```

访问 http://localhost:8888 即可使用（API 服务同时托管前端静态文件）。

### 4. 查看状态与日志

```bash
# 查看容器状态
docker compose ps

# 查看实时日志
docker compose logs -f

# 停止服务
docker compose down
```

### 5. 前端热更新开发（可选）

如需在前端开发时使用 Docker 后端，可启动 frontend profile：

```bash
docker compose --profile frontend up -d
```

前端访问 http://localhost:5899，后端在 8888。

---

## 三、生产环境部署（阿里云 ACR）

### 1. 构建并推送镜像

```bash
# 登录阿里云 ACR
docker login --username=<阿里云账号> registry.<区域>.aliyuncs.com

# 构建并打标签
docker build -t registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:latest .
docker tag registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:latest registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:v0.1.8

# 推送
docker push registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:latest
docker push registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:v0.1.8
```

常用区域地址：

| 区域 | Registry 地址 |
|------|--------------|
| 华东1（杭州） | `registry.cn-hangzhou.aliyuncs.com` |
| 华东2（上海） | `registry.cn-shanghai.aliyuncs.com` |
| 华南1（深圳） | `registry.cn-shenzhen.aliyuncs.com` |
| 华北2（北京） | `registry.cn-beijing.aliyuncs.com` |

### 2. 服务器上部署

修改 `docker-compose.yml` 中的 `image` 为 ACR 地址：

```yaml
services:
  deep-trace:
    image: registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:latest
    ports:
      - "8888:8888"    # 生产环境可改为 127.0.0.1:8888 配合 Nginx
    env_file:
      - agent/.env
    environment:
      - DEEP_TRACE_TRUST_DOCKER_LOOPBACK=1
    volumes:
      - deep-trace-runs:/app/agent/runs
      - deep-trace-sessions:/app/agent/sessions
    restart: unless-stopped
```

在服务器上执行：

```bash
# 登录 ACR
docker login --username=<阿里云账号> registry.<区域>.aliyuncs.com

# 拉取并启动
docker compose pull
docker compose up -d
```

### 3. 更新部署

```bash
# 重新构建 → 推送 → 拉取 → 重启
docker build -t registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:latest .
docker push registry.<区域>.aliyuncs.com/<命名空间>/deep-trace:latest
docker compose pull && docker compose up -d
```

---

## 四、常见问题

### 端口被占用

```bash
# 查看占用端口的进程
lsof -i :8888

# 停止进程
kill <PID>
```

### Docker 构建时网络超时

确保已开启代理或在 Dockerfile 中使用国内镜像源（已默认配置阿里云 Debian 源）。

### 前端页面空白

确认后端服务正常启动，前端构建产物已正确生成在 `frontend/dist/` 目录。
