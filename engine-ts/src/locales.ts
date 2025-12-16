export type LocaleKey =
    | 'title'
    | 'play_button'
    | 'settings_button'
    | 'subtitle'
    | 'vibe_mode'
    | 'select_scenario'
    | 'back_button'
    | 'volume'
    | 'graphics'
    | 'language'
    | 'quality_low'
    | 'quality_medium'
    | 'quality_high'
    | 'lang_en'
    | 'lang_cn';

export const locales: Record<string, Record<LocaleKey, string>> = {
    en: {
        title: "READABLE ENGINE",
        play_button: "PLAY",
        settings_button: "SETTINGS",
        subtitle: "Deterministic Core",
        vibe_mode: "Vibe Mode Active",
        select_scenario: "SELECT SCENARIO",
        back_button: "BACK",
        volume: "Master Volume",
        graphics: "Graphics Quality",
        language: "Language",
        quality_low: "Low",
        quality_medium: "Medium",
        quality_high: "High",
        lang_en: "English",
        lang_cn: "Chinese"
    },
    cn: {
        title: "可读引擎",
        play_button: "开始游戏",
        settings_button: "设置",
        subtitle: "确定性核心",
        vibe_mode: "Vibe 模式已激活",
        select_scenario: "选择剧本",
        back_button: "返回",
        volume: "主音量",
        graphics: "画质",
        language: "语言",
        quality_low: "低",
        quality_medium: "中",
        quality_high: "高",
        lang_en: "英语",
        lang_cn: "中文"
    }
};
