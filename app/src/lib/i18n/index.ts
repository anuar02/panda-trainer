import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ru } from './ru';
const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'ru',
  fallbackLng: 'ru',
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
  initAsync: false,
});
export { i18n };
