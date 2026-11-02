# KAGE 影 — kontekst projektu

Własna strategia dashboardu Home Assistant. Ten plik zbiera decyzje produktowe i techniczne; czytaj go przed każdą pracą w repozytorium. Rozmowy z właścicielem prowadzimy po polsku.

## Źródła prawdy

- Plan projektu (etapy, role, profile urządzeń, backlog): https://claude.ai/artifact/Nop46R7ge1cbFyRXKBm8tu
- Design system KAGE (tokeny Neon i Holo, komponenty, zasady): https://claude.ai/artifact/DCSe7SgUTP39sEtHbeWhUa
- Makiety interaktywne (strona Projekt: Telefon, Tablet osobisty, Panel ścienny): https://claude.ai/artifact/CodRHvVhKwWwdVBMArVSKk

Przy rozbieżności: design system > makiety; plan projektu > ten plik dla zakresu etapów.

## Instalacja właściciela

Home Assistant OS, Core 2026.10.2, Frontend 20260930.4. Instalacja przez HACS jako custom repository (kategoria Dashboard).

## Architektura

- `src/index.ts` rejestruje `ll-strategy-dashboard-kage` i `ll-strategy-view-kage` oraz wpis w `window.customStrategies` (HA 2026.5+, sekcja Community dashboards). Konfiguracja: `strategy: { type: custom:kage }`.
- Strategia dashboardu zwraca tylko listę widoków; zawartość widoku buduje strategia widoku przy jego otwarciu.
- `src/engine/model.ts` buduje model domu z `hass.floors/areas/devices/entities` (fallback: `config/floor_registry/list`). Piętra z tym samym `level` tworzą jeden poziom (parter + ogród obok siebie). Pomijamy encje ukryte i z `entity_category`. Encja trafia do obszaru wprost albo przez urządzenie.
- `src/i18n/` teksty interfejsu: pl, en, zh-Hans (niezweryfikowany). Język z profilu HA, fallback en. Odmiana przez `Intl.PluralRules`. Nazw z HA nie tłumaczymy.
- Build: Vite, jeden plik ES module `dist/kage.js`. Lit jest zależnością na etap 4 (własne karty).

## Decyzje produktowe (nie zmieniać bez właściciela)

- Konteksty v1.0: **Poza domem** (przegląd problemów + Zabezpiecz dom), **W domu** (pokój, w którym jesteś + sceny), **Zdarzenie pilne** (przejmuje ekran, np. dzwonek), **Panel ścienny** (kiosk). Pozostałe tryby w backlogu 1.x, dodawane przez silnik kontekstów (reguły), nie nowe ekrany.
- Obecność: wyłącznie encja `person` zalogowanego użytkownika (np. Wi-Fi z routera); pokój osoby z opcjonalnego sensora obszaru (np. Bermuda). Bez geolokalizacji. Brak danych: W domu + ostatni pokój.
- Panel ścienny to techniczny użytkownik HA; opcja „Konto techniczne” wyłącza go z obecności i z listy „Kto jest w domu”. Pokój panelu wykrywany tym samym mechanizmem co pokój osoby.
- **Bez kodów PIN.** Akcje fizyczne (brama, furtka, zawór wody) wymagają przytrzymania 1,1 s (HoldButton); reszta jednym dotknięciem.
- **Bez wypełniaczy:** żadnego zegara, daty, powitań, pogody dla ozdoby.
- **Bez widoków administracyjnych.** Pokazujemy to, na co domownik może zareagować (słaba bateria, brak ciepłej wody, ciśnienie, pobór prądu przy pustym domu); wykresy, historia, diagnostyka zostają w dashboardach administratora.
- Role i uprawnienia konfigurowane w edytorze strategii w HA; role to konfiguracja, nie kod. Ograniczenia ukrywają interfejs, nie zabezpieczają urządzeń.
- Rzut warstwowy: wszystkie piętra naraz, aktywne ostre, reszta rozmyta; ten sam poziom obok siebie (ogród), przejście w bok przesuwa cały budynek; karty pięter zwartą kolumną w lewym dolnym rogu. Układ pokoi: automatyczny, z edytorem rzutu (etap 6).
- Teren zewnętrzny: przełącznik w edytorze, domyślnie zgadywany z ikony, etykiety `zewnatrz` lub nazwy.
- Urządzenia: telefon (aplikacja HA na iPhone, dashboard jako domyślny, bez paska HA dla domowników), tablet osobisty, laptop, panel ścienny (motyw Holo). Apple Watch: backlog 1.x.

## Zasady pracy w kodzie

- TypeScript strict; testy Vitest na zrzutach rejestrów w `test/fixtures/`; każdy nowy element silnika ma test.
- `npm run check` musi przejść przed commitem; CI robi to samo i walidację HACS.
- Wydania przez GitHub Releases (tag `vX.Y.Z`, opublikowane w UI); workflow Release dołącza `kage.js`. Sesja Claude może wypychać gałęzie, ale nie tagi.
- Tylko publiczne API frontendu HA; nie sięgamy do prywatnych elementów `ha-*` bez potrzeby.
- Teksty interfejsu zawsze przez `src/i18n`, nigdy na sztywno w kodzie.

## Etapy

0–1 zakończone (discovery, design). Etap 2 (szkielet) zakończony; v0.2 = ekran „W domu” na telefonie (karta `kage-home-card`, widok Porządki tylko dla admina). Dalej: 3 silnik generowania (role, konteksty, problemy), 4 karty i motyw, 5 widoki specjalne, 6 konfiguracja i UX (edytor ról i rzutu), 7 testy i wydanie 1.0.
