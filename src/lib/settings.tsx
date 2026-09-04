// Re-export everything from the unified prefs module.
// This file exists for backward compatibility during migration.
export {
  useSettings,
  SettingsProvider,
  COLOR_OPTIONS,
  applyTheme,
  applyColorTheme,
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsApi,
  type ThemePref,
  type ColorTheme,
} from "./prefs";
