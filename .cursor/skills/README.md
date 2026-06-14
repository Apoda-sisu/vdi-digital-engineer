# Cursor Skills（本项目）

| Skill | 来源 | 用途 |
|-------|------|------|
| `skill-creator` | [anthropics/skills](https://skills.sh/anthropics/skills/skill-creator) | Skill 起草、eval、description 优化 |
| `vdi-skill-governance` | 本项目 | VDI 约定 + audit 门禁 |

## 安装/更新 skill-creator

```bash
# 官方 CLI（需网络）
npx skills add anthropics/skills@skill-creator -g -y

# 或手动（已安装于 ~/.cursor/skills/skill-creator）
gh api repos/anthropics/skills/tarball/main > /tmp/skills.tar.gz
tar xzf /tmp/skills.tar.gz -C /tmp
cp -R /tmp/anthropics-skills-*/skills/skill-creator ~/.cursor/skills/
```

安装后 **重启 Cursor 或新开 Agent 会话** 以加载 Skill。

## 使用

在 Agent 中说：「用 skill-creator 新建 xxx Skill，并按 vdi-skill-governance 跑审计」

或输入 `/skill-creator`、`/vdi-skill-governance`。

全局审计：`node pilotdeck-vdi/scripts/audit-all-skills.mjs`
