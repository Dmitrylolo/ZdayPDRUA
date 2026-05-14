# ЗДай ПДР UA 🚗

Мобільний застосунок для підготовки до іспиту з Правил дорожнього руху України.  
Офіційна база з 2165+ питань, режими тренування та іспиту, детальна статистика.

---

## Скріншоти

> _Скоро будуть додані_

---

## Функціонал

| Екран | Опис |
|---|---|
| **Категорії** | Вибір категорії транспортного засобу (A, B, C, D…) |
| **Тренування (Quiz)** | Проходження питань по розділах ПДР |
| **Іспит (Exam)** | Симуляція офіційного іспиту з таймером і лімітом помилок |
| **Результат іспиту** | Детальний розбір допущених помилок |
| **Помилки (Mistakes)** | Повторне проходження питань, де були помилки |
| **Статистика** | Прогрес по темах, відсоток правильних відповідей |

---

## Технологічний стек

**Мобільний застосунок**

- [React Native](https://reactnative.dev/) 0.84 (New Architecture)
- [React Navigation](https://reactnavigation.org/) — навігація між екранами
- [TanStack Query](https://tanstack.com/query) — керування станом даних
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv) — швидке локальне сховище (прогрес, налаштування)
- [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/) — анімації
- [i18next](https://www.i18next.com/) + react-i18next — інтернаціоналізація
- [Zod](https://zod.dev/) — валідація даних
- [lucide-react-native](https://lucide.dev/) — іконки

**Парсер питань** (`parser/`)

- Python 3 + [PyMuPDF (fitz)](https://pymupdf.readthedocs.io/) — парсинг питань з офіційного PDF
- [scikit-learn](https://scikit-learn.org/) TF-IDF — автоматична прив'язка питань до норм ПДР
- [BeautifulSoup](https://www.crummy.com/software/BeautifulSoup/) — скрапінг розділів ПДР з [pdr.infotech.gov.ua](https://pdr.infotech.gov.ua)

---

## Структура проєкту

```
src/
  screens/          # Екрани застосунку
  components/       # UI-компоненти (atoms, molecules, organisms)
  navigation/       # React Navigation конфігурація
  services/         # Репозиторії даних (питання, прогрес, категорії)
  hooks/            # Кастомні хуки
  theme/            # Дизайн-система (кольори, шрифти, відступи)
  translations/     # Локалізація (uk, en)

parser/
  build_questions.py      # Парсинг питань з PDF → questions.json
  build_answers.py        # Визначення правильних відповідей
  build_pdr_rules.py      # Скрапінг розділів ПДР
  build_explanations.py   # Генерація пояснень через TF-IDF
  repair_correct_answers.py
  validate_answers.py
  output/                 # Згенеровані JSON-файли
```

---

## Запуск

### Передумови

- Node.js ≥ 18
- React Native CLI (`@react-native-community/cli`)
- Xcode (для iOS) / Android Studio (для Android)

### Встановлення залежностей

```bash
yarn install

# iOS
yarn pod-install
```

### Запуск

```bash
# Metro bundler
yarn start

# iOS
yarn ios

# Android
yarn android
```

### Тести

```bash
yarn test
```

---

## Парсер питань

Якщо потрібно оновити базу питань:

```bash
cd parser
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt  # або: pip install pymupdf scikit-learn beautifulsoup4 requests

python3 build_questions.py        # парсинг PDF
python3 repair_correct_answers.py # виправлення правильних відповідей
python3 build_pdr_rules.py        # скрапінг розділів ПДР
python3 build_explanations.py     # генерація пояснень
```

Результат — `parser/output/questions.final.json`, який копіюється в `src/assets/questions/questions.json`.

---

## Ліцензія

MIT
