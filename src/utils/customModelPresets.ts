import type { CustomApiStorageData } from './customApiStorage.js'

export type CustomModelPreset = {
  id: string
  provider: NonNullable<CustomApiStorageData['provider']>
  baseURL: string
  model: string
  label: string
  recommendedFor: string
}

const CUSTOM_MODEL_PRESETS: readonly CustomModelPreset[] = [
  {
    id: 'bailian-qwen3.5-plus',
    provider: 'anthropic',
    baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
    model: 'qwen3.5-plus',
    label: 'Bailian Qwen 3.5 Plus',
    recommendedFor: 'general coding and complex daily work',
  },
  {
    id: 'bailian-qwen3.6-plus',
    provider: 'openai',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.6-plus',
    label: 'Bailian Qwen 3.6 Plus',
    recommendedFor: 'general coding with the latest DashScope OpenAI-compatible route',
  },
  {
    id: 'bailian-qwen3.6-plus-preview',
    provider: 'openai',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.6-plus-preview',
    label: 'Bailian Qwen 3.6 Plus Preview',
    recommendedFor: 'early access testing on the latest Qwen 3.6 preview model',
  },
  {
    id: 'bailian-qwen3-coder-next',
    provider: 'anthropic',
    baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
    model: 'qwen3-coder-next',
    label: 'Bailian Qwen 3 Coder Next',
    recommendedFor: 'fast coding loops and code edits',
  },
  {
    id: 'bailian-qwen3-coder-plus',
    provider: 'anthropic',
    baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
    model: 'qwen3-coder-plus',
    label: 'Bailian Qwen 3 Coder Plus',
    recommendedFor: 'heavier repo work and multi-file changes',
  },
  {
    id: 'bailian-glm-4.7',
    provider: 'anthropic',
    baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
    model: 'glm-4.7',
    label: 'Bailian GLM 4.7',
    recommendedFor: 'agentic coding with Anthropic-compatible routing',
  },
  {
    id: 'bailian-kimi-k2.5',
    provider: 'anthropic',
    baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
    model: 'kimi-k2.5',
    label: 'Bailian Kimi K2.5',
    recommendedFor: 'strong coding plus broader general reasoning',
  },
  {
    id: 'deepseek-v4-flash',
    provider: 'openai',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    recommendedFor: 'fast daily coding with the current DeepSeek v4 default',
  },
  {
    id: 'deepseek-v4-pro',
    provider: 'openai',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    recommendedFor: 'stronger reasoning and heavier repo work on DeepSeek v4',
  },
  {
    id: 'deepseek-chat',
    provider: 'openai',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    label: 'DeepSeek Chat (Legacy Alias)',
    recommendedFor: 'legacy compatibility alias for DeepSeek V4 Flash until 2026-07-24',
  },
  {
    id: 'deepseek-reasoner',
    provider: 'openai',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner (Legacy Alias)',
    recommendedFor: 'legacy compatibility alias for DeepSeek V4 Flash thinking mode until 2026-07-24',
  },
  {
    id: 'moonshot-kimi-k2.5',
    provider: 'openai',
    baseURL: 'https://api.moonshot.cn',
    model: 'kimi-k2.5',
    label: 'Moonshot Kimi K2.5',
    recommendedFor: 'best direct Kimi preset for coding and agent work',
  },
  {
    id: 'moonshot-kimi-k2-thinking',
    provider: 'openai',
    baseURL: 'https://api.moonshot.cn',
    model: 'kimi-k2-thinking',
    label: 'Moonshot Kimi K2 Thinking',
    recommendedFor: 'deep reasoning and multi-step tool use',
  },
  {
    id: 'zhipu-glm-4.7',
    provider: 'openai',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.7',
    label: 'Zhipu GLM 4.7',
    recommendedFor: 'direct GLM access for coding-heavy sessions',
  },
] as const

const PRESET_LOOKUP = (() => {
  const lookup = new Map<string, CustomModelPreset>()
  for (const preset of CUSTOM_MODEL_PRESETS) {
    lookup.set(preset.id.toLowerCase(), preset)
    lookup.set(preset.model.toLowerCase(), preset)
  }
  return lookup
})()

const RENDERED_PRESET_LIST = CUSTOM_MODEL_PRESETS.map(
  preset =>
    `- ${preset.id}: ${preset.model} (${preset.provider}) - ${preset.recommendedFor}`,
).join('\n')

export function getCustomModelPresets(): readonly CustomModelPreset[] {
  return CUSTOM_MODEL_PRESETS
}

export function findCustomModelPreset(
  id: string,
): CustomModelPreset | undefined {
  return PRESET_LOOKUP.get(id.trim().toLowerCase())
}

export function renderCustomModelPresetList(): string {
  return RENDERED_PRESET_LIST
}
