import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import fr from './locales/fr.json'
import en from './locales/en.json'

export const languages = ['fr', 'en'] as const
export type Language = (typeof languages)[number]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    fallbackLng: 'fr',
    supportedLngs: [...languages],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'krimossimo-lang',
      caches: ['localStorage'],
    },
  })

function syncHtmlLang(lng: string) {
  document.documentElement.lang = lng.startsWith('en') ? 'en' : 'fr'
}
syncHtmlLang(i18n.resolvedLanguage ?? 'fr')
i18n.on('languageChanged', syncHtmlLang)

export default i18n
