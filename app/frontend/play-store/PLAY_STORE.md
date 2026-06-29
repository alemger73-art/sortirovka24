# Google Play — Sortirovka24

Пошаговая инструкция для публикации. Техническая часть подготовлена в репозитории.

## Что уже сделано в проекте

| Готово | Где |
|--------|-----|
| Release keystore (скрипт создания) | `scripts/setup-play-keystore.ps1` |
| Сборка подписанного AAB | `npm run build:android:release` |
| Package ID | `kz.sortirovka24.app` |
| targetSdk 35 | `android/variables.gradle` |
| Иконка 512×512 | `public/icon-512.png` |
| Feature graphic | `play-store/feature-graphic.png` |
| Политика конфиденциальности (статика) | `public/privacy.html` |
| Тексты для карточки магазина | `play-store/LISTING_RU.md` |
| Ответы Data safety | `play-store/DATA_SAFETY.md` |

## URL для Play Console

После деплоя на Railway (Dockerfile в корне репозитория):

**Политика конфиденциальности:**
```
https://sortirovka24-production-8788.up.railway.app/privacy.html
```

**Пользовательское соглашение:**
```
https://sortirovka24-production-8788.up.railway.app/terms.html
```

> Задеплойте последний коммит на Railway, чтобы эти страницы появились онлайн.

---

## Шаг 1 — Аккаунт Google Play ($25)

1. https://play.google.com/console
2. Создайте аккаунт разработчика (личный или организация)
3. Оплатите регистрацию $25 (единоразово)

---

## Шаг 2 — Собрать release AAB

**Вариант A — локально (Windows):**

```powershell
cd app\frontend
npm run setup:play-keystore    # один раз
npm run build:android:release
```

**Вариант B — GitHub Actions (без локального keystore на CI-машине):**

1. После `setup:play-keystore` на своём ПК: `npm run export:play-keystore`
2. GitHub → Secrets → добавить `PLAY_KEYSTORE_BASE64`, `PLAY_KEYSTORE_PASSWORD`, `PLAY_KEY_ALIAS`, `PLAY_KEY_PASSWORD`
3. Actions → **Android Release (Google Play AAB)** → Run workflow
4. Скачать AAB из Artifacts

Файл для загрузки (локальная сборка):
```
app\frontend\releases\Sortirovka24-release.aab
```

**Пароли от подписи** сохранены в (не коммитить!):
```
app\frontend\android\PLAY_SIGNING_SECRET.txt
```
Скопируйте в надёжное место (менеджер паролей). Без keystore обновления в Play невозможны.

---

## Шаг 3 — Создать приложение в консоли

1. **Create app**
2. Название: **Sortirovka24** (в магазине можно «Сортировка 24»)
3. Default language: **Русский**
4. App / Free

---

## Шаг 4 — Store listing (карточка)

Скопируйте тексты из `play-store/LISTING_RU.md`.

Загрузите:
- **App icon** — `public/icon-512.png`
- **Feature graphic** — `play-store/feature-graphic.png`
- **Phone screenshots** — минимум 2 (см. `play-store/SCREENSHOTS.md`)

---

## Шаг 5 — Обязательные анкеты

### App content → Privacy policy
URL: `https://sortirovka24-production-8788.up.railway.app/privacy.html`

### Data safety
Ответы: `play-store/DATA_SAFETY.md`

### Content rating
Заполните анкету IARC (обычно без насилия/18+ → рейтинг для всех / 12+).

### Target audience
Укажите, что приложение **не ориентировано на детей** (есть регистрация по телефону).

---

## Шаг 6 — Загрузка и публикация

1. **Testing → Internal testing** → Create new release
2. Upload **Sortirovka24-release.aab**
3. Release notes (из LISTING_RU.md)
4. Добавьте себя в тестировщики → проверьте установку
5. **Production** → Promote release (или новый релиз в Production)

Модерация: обычно 1–7 дней.

---

## Обновления в будущем

1. Увеличить в `android/app/build.gradle`:
   - `versionCode` (+1 каждый раз)
   - `versionName` (например 1.0.17)
2. `npm run build:android:release`
3. Play Console → новый release → загрузить AAB

---

## Чеклист перед отправкой

- [ ] Railway `/health` → `database: ok`
- [ ] `MOBIZON_API_KEY`, `CLOUDINARY_*` на Railway
- [ ] `privacy.html` открывается в браузере
- [ ] AAB собран и подписан
- [ ] PLAY_SIGNING_SECRET.txt сохранён вне репозитория
- [ ] 2+ скриншота с телефона
- [ ] Internal testing пройден
