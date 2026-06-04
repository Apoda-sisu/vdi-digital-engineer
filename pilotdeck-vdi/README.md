# PilotDeck VDI 深集成产品包

将虚拟设计院（VDI）数字工程师能力以 **PilotDeck Plugin** 形式部署，对应建设规划：`docs/PilotDeck-VDI-深集成建设规划.md`。

## 插件列表

| 目录 | 状态 | 说明 |
|------|------|------|
| `products/vdi/plugins/vdi-knowledge` | 骨架 | 规范/知识检索 |
| `products/vdi/plugins/vdi-rules` | 骨架 | 红线与输出契约校验 |
| `products/vdi/plugins/vdi-events` | 骨架 | 事件总线 |
| `products/vdi/plugins/vdi-orchestrator` | 骨架 | 专业智能体路由 |

## 部署到本地 Docker PilotDeck

```bash
# 1. 链接插件到 PilotDeck 全局目录（宿主机）
mkdir -p ~/.pilotdeck/plugins
for p in vdi-knowledge vdi-rules vdi-events vdi-orchestrator; do
  ln -sf "/Users/apoda/Documents/Cursor/016-数字工程师/pilotdeck-vdi/products/vdi/plugins/$p" \
    "$HOME/.pilotdeck/plugins/$p"
done

# 2. 迁移 VDI Skills
cd /Users/apoda/GitHub/PilotDeck
npm run skills:migrate -- \
  --source "/Users/apoda/Documents/Cursor/016-数字工程师/skills" \
  --execute

# 3. 重启容器（若 docker-compose 已挂载 ~/.pilotdeck）
cd /Users/apoda/GitHub/PilotDeck && docker compose restart
```

## Docker Compose 建议挂载

在 `PilotDeck/docker-compose.yml` 的 `volumes` 中增加：

```yaml
- /Users/apoda/Documents/Cursor/016-数字工程师:/workspace
- /Users/apoda/.pilotdeck/plugins:/root/.pilotdeck/plugins
- pilotdeck-home:/root/.pilotdeck
```

WorkSpace 根目录使用 `/workspace` 下子目录，例如 `/workspace/workspaces/VDI-给水排水-试点A`。

## 开发顺序

1. `vdi-knowledge` v0 → 试点 A 规范引用  
2. `vdi-rules` → 三审三校闸门  
3. `vdi-events` + `vdi-orchestrator` → 试点 B 跨专业提资  
