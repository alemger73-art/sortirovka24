# Мультиязычная система (RU/KZ) — План разработки

## Design Guidelines
- **Style**: Kaspi / Glovo — чистый минимализм, крупные кнопки
- **Colors**: Existing palette preserved
- **Typography**: Заголовки 16-18px mobile, 24-36px desktop; Текст 14px
- **Buttons**: Минимум 44px touch target на мобильных
- **Spacing**: 16px минимум по краям, 12-20px между блоками

## Файлы для создания/обновления (8 файлов max)

1. **src/i18n/translations.ts** — JSON-структура всех переводов RU/KZ (навигация, кнопки, заголовки, формы, еда, недвижимость, админ)
2. **src/contexts/LanguageContext.tsx** — Контекст языка с автоопределением, localStorage, хук useTranslation
3. **src/components/Layout.tsx** — Обновить: переключатель языка RU/KZ в шапке, перевод навигации и футера
4. **src/pages/Index.tsx** — Обновить: все тексты через i18n ключи, hero-баннер адаптив, skeleton loading
5. **src/pages/Food.tsx** — Обновить: name_ru/name_kz отображение, модификаторы с валидацией, i18n UI
6. **src/pages/Content.tsx** — Обновить: недвижимость description_ru/description_kz, фильтры i18n
7. **src/pages/AdminFood.tsx** — Обновить: двуязычные поля ввода для товаров и модификаторов
8. **src/pages/AdminRealEstate.tsx** — Обновить: двуязычные поля для недвижимости

## Логика i18n
- Автоопределение языка устройства при первом входе
- Сохранение выбора в localStorage
- Переключатель RU/KZ в шапке
- Для статических текстов: JSON ключи через useTranslation хук
- Для данных из БД: отображение name_ru/name_kz в зависимости от текущего языка
- Плавная анимация смены языка (transition)
- Skeleton loading при загрузке данных