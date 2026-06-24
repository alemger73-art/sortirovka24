# Презентации Sortirovka24

## Партнёрская презентация (магазин «Волна», аптека)

**Для переговоров с магазинами, аптеками, локальным бизнесом.**

| Файл | Назначение |
|------|------------|
| `partner-presentation.html` | **18 слайдов** — магазин + аптека, реальные скрины, «зачем / как / почему» |
| `sortirovka24-presentation.html` | Общая презентация проекта (24 слайда) |

### Открыть

```
file:///C:/Users/User/Documents/GitHub/sortirovka24/docs/presentation/partner-presentation.html
```

Внизу экрана — фильтры:
- **Вся презентация** — все 18 слайдов
- **Магазин (Волна)** — только блок Гастроном
- **Аптека** — только блок аптеки

### PDF

```powershell
cd docs\presentation
# Закройте PDF если открыт
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="Sortirovka24-Partner.pdf" --no-margins "file:///C:/Users/User/Documents/GitHub/sortirovka24/docs/presentation/partner-presentation.html"
```

Или кнопка **«PDF / Печать»** в браузере (F11 для полноэкранного показа).

---

## Содержание partner-presentation (18 слайдов)

| # | Слайд | Для кого |
|---|-------|----------|
| 1 | Обложка — ваш бизнес в кармане жителя | Все |
| 2 | Что такое Sortirovka24 | Все |
| 3 | Кто ваш клиент · было/стало | Все |
| 4–8 | **Магазин «Волна»** — модуль Гастроном | shop |
| 9–12 | **Аптека** — модуль Аптека | pharmacy |
| 13 | Экосистема (DAM ALEM, такси, …) | Все |
| 14 | Подключение за 3 дня | Все |
| 15 | Цифры и потенциал | Все |
| 16 | FAQ партнёров | Все |
| 17 | CTA — заявка, контакты | Все |
| 18 | Спасибо | Все |

---

## Скриншоты (оригиналы production)

Папка: `screenshots/`

Обновить все скрины с production:

```powershell
cd app\frontend
pnpm run capture:presentation
```

Новые файлы для партнёров:
- `mobile-gastronom.png`, `desktop-gastronom.png`
- `mobile-pharmacy.png`, `tablet-pharmacy.png`, `desktop-pharmacy.png`
- `mobile-business.png`, `mobile-prorab.png`

Если файла нет — HTML подставит запасной скрин (`onerror`).

---

## Как кастомизировать под «Волну»

1. Откройте `partner-presentation.html` в редакторе
2. Замените «Волна» на название магазина (поиск по файлу)
3. Переснимите скрины после загрузки их каталога в админке
4. Вставьте логотип (опционально) — блок `.badge` на слайде 4

---

## Общая презентация

См. `sortirovka24-presentation.html` — для инвесторов, УК, жителей.
