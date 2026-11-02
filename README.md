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

## Rozwój

```bash
npm install
npm run check     # typy, testy, build → dist/kage.js
npm run dev       # build w trybie watch
```

Test w przeglądarce (wymaga Playwright): `npm run build && node dev/smoke.mjs`.

Szybki test na własnym HA bez wydania: skopiuj `dist/kage.js` do `/config/www/kage.js` i dodaj zasób `/local/kage.js` (typ: moduł JavaScript) w Ustawienia → Dashboardy → Zasoby.

Wydanie: podnieś wersję w `package.json`, a potem na GitHubie **Releases → Draft a new release**, tag `vX.Y.Z`, **Publish**. GitHub Actions zbuduje `kage.js` i dołączy go do wydania, które pobiera HACS.
