# KAGE 影

Kontekstowy dashboard dla Home Assistant. KAGE (jap. „cień”) sam buduje interfejs z Twoich pięter, obszarów, urządzeń i encji, a pokazuje przede wszystkim to, co w danej chwili wymaga uwagi: poza domem przegląd zabezpieczeń, w domu sterowanie pokojem, w którym jesteś.

> **Status: wersja techniczna 0.1.** Silnik czyta rejestry HA i generuje widok z piętrami i obszarami na kartach wbudowanych w HA. Docelowy wygląd (rzut 3D pięter, konteksty, panel ścienny) dochodzi w kolejnych etapach.

## Wymagania

- Home Assistant 2026.5 lub nowszy
- HACS

## Instalacja przez HACS

1. HACS → menu ⋮ → **Custom repositories**.
2. Adres tego repozytorium, kategoria **Dashboard**, Dodaj.
3. Znajdź **KAGE** w HACS i pobierz. HACS doda zasób `/hacsfiles/kage-dashboard/kage.js`.
4. Odśwież przeglądarkę (lub aplikację HA).
5. Ustawienia → Dashboardy → **Dodaj dashboard** → w sekcji *Community dashboards* wybierz **KAGE**.

### Ręcznie, w YAML

Utwórz nowy dashboard, otwórz edytor surowej konfiguracji i wklej:

```yaml
strategy:
  type: custom:kage
```

## Telefon domownika: KAGE jako ekran główny, bez paska HA

1. W aplikacji HA na telefonie domownika (zalogowanym na jego konto): Profil → **Dashboard** → KAGE. To ustawienie dotyczy tylko tego urządzenia.
2. Pasek i menu boczne HA ukrywa dodatek [kiosk-mode](https://github.com/NemesisRE/kiosk-mode) (HACS → Frontend). W dashboardzie kliknij ołówek – okno „Edit dashboard” pokazuje konfigurację strategii – i wpisz:

```yaml
type: custom:kage
kiosk_mode:
  non_admin_settings:
    hide_header: true
    hide_sidebar: true
```

(W edytorze surowej konfiguracji to samo stoi pod kluczem `strategy:`.) Nie wybieraj „Take control” – zamienia KAGE w zwykły dashboard.

KAGE przekazuje `kiosk_mode` dalej, więc dodatek działa też na dashboardzie ze strategią. Administrator widzi pasek jak zwykle. Awaryjnie: `?disable_km` na końcu adresu.

## Rozwój

```bash
npm install
npm run check     # typy, testy, build → dist/kage.js
npm run dev       # build w trybie watch
```

Test w przeglądarce (wymaga Playwright): `npm run build && node dev/smoke.mjs`.

Szybki test na własnym HA bez wydania: skopiuj `dist/kage.js` do `/config/www/kage.js` i dodaj zasób `/local/kage.js` (typ: moduł JavaScript) w Ustawienia → Dashboardy → Zasoby.

Wydanie: podnieś wersję w `package.json`, a potem na GitHubie **Releases → Draft a new release**, tag `vX.Y.Z`, **Publish**. GitHub Actions zbuduje `kage.js` i dołączy go do wydania, które pobiera HACS.

## Licencja

MIT, zobacz [LICENSE](LICENSE).
