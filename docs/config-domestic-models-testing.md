# /config 国产模型入口测试说明

这份文档用于验证刚加进去的 `/config` 面板能力：

- 选择国产模型预设
- 输入并保存 API Key
- 在已保存模型之间切换
- 按 `Esc` 取消后恢复原配置

## 1. 环境准备

建议环境：

- Windows PowerShell
- Bun `>= 1.3.5`
- Node.js `>= 24`

先在仓库根目录安装依赖：

```powershell
bun install
```

如果你只是想先确认 CLI 能启动：

```powershell
bun run version
```

预期会看到类似输出：

```text
999.0.0-DOGE (Claude Code)
```

## 2. 启动方式

在仓库根目录运行：

```powershell
bun run dev
```

启动后进入交互界面。

## 3. 打开配置面板

在交互界面输入：

```text
/config
```

你应该能看到这几个相关项：

- `Domestic model preset`
- `Switch saved compatible model`
- `Compatible API Key`

## 4. 测试国产模型预设

进入：

- `Domestic model preset`

建议先选一个你手上已经有 key 的模型，例如：

- `Bailian Qwen 3 Coder Next`
- `DeepSeek Chat`
- `Moonshot Kimi K2.5`
- `Zhipu GLM 4.7`

选中后，预期行为：

- 当前兼容接口的 `provider / baseURL / model` 会立即切换
- 该模型会进入已保存模型列表
- 返回 `/config` 首页后，`Domestic model preset` 的显示值会更新

## 5. 测试输入 API Key

进入：

- `Compatible API Key`

输入对应厂商的 key，然后按回车保存。

预期行为：

- 配置页里会显示脱敏后的 key
- 当前会话会立即使用这个 key
- 再次打开该项时，能看到已保存内容被回填为掩码输入

说明：

- 留空再回车，会清空当前模型保存的 key

## 6. 测试模型切换

先至少保存过两个模型，例如：

1. 在 `Domestic model preset` 里选 `DeepSeek Chat`
2. 在 `Compatible API Key` 里填入 DeepSeek key
3. 再选 `Bailian Qwen 3 Coder Next`
4. 再填入百炼 key

然后进入：

- `Switch saved compatible model`

来回切换两个模型。

预期行为：

- `baseURL` 跟着模型切换
- `model` 跟着模型切换
- 如果该模型保存过 key，key 也跟着切换
- 返回配置首页后，三项显示值同步更新

## 7. 测试取消回滚

这个测试是为了验证 `/config` 里按 `Esc` 不会留下脏配置。

推荐步骤：

1. 先记住当前正在使用的模型
2. 打开 `/config`
3. 切到另一个 `Domestic model preset`
4. 不要按保存退出，直接按 `Esc`
5. 重新打开 `/config`

预期行为：

- 当前模型恢复成进入 `/config` 之前的状态
- `Compatible API Key` 也恢复成进入前的状态
- 已切换但未确认的临时状态不会残留

## 8. 命令行补充测试

除了 `/config` 面板，也可以用命令辅助验证：

列出已保存模型：

```text
/list-models
```

切换模型：

```text
/use-model deepseek-chat
```

给当前模型写 key：

```text
/set-api-key sk-xxxx
```

或者给指定模型写 key：

```text
/set-api-key deepseek-chat sk-xxxx
```

添加预设：

```text
/add-model --list-presets
/add-model --preset bailian-qwen3-coder-next
```

## 9. 一套最短验证流程

如果你只想最快确认这次功能可用，按下面跑一遍：

```powershell
bun install
bun run dev
```

进入 CLI 后执行：

```text
/config
```

然后依次做：

1. 在 `Domestic model preset` 里选一个模型
2. 在 `Compatible API Key` 里填 key
3. 回到首页确认显示值变了
4. 再次进入 `/config`，切到另一个已保存模型
5. 按 `Esc` 退出
6. 重新打开 `/config` 看状态是否符合预期

## 10. 当前已知问题

- 如果本机 Bun 缓存目录权限异常，某些额外的源码级 import 检查可能失败
- 但 `bun run version` 通过时，至少说明主 CLI 启动链路没有被这次改动打断
- 首次运行前必须先 `bun install`，否则 `react` 等依赖可能找不到

