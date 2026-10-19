# Ciastkobranie

Arcade jednym przyciskiem, napisane w JavaScript i Canvas 2D. Ucz się rytmu krótkich tras, wybieraj cechy torem lotu i łącz je ze zdolnością. Lot nie zatrzymuje się na wybory.

## Uruchomienie

```sh
npm start
# http://localhost:8000
npm test
```

Bez zależności i budowania. Python 3 do serwera, Node.js 18+ do testów. Moduły wymagają HTTP; gra nadaje się do GitHub Pages.

Klik / dotyk / spacja — skok. Esc — pauza. Ukrycie karty zatrzymuje grę. Śmierć ma krótki hitstop i zwolniony upadek: 0,35 s dla prób krótszych niż 15 s, potem 0,7 s. Już po 0,12 s świeże naciśnięcie rozpoczyna rewanż, bez obowiązkowego ekranu wyników.

## Trasy i nauka

| Trasa | Czas | Charakter |
|---|---|---|
| Tłocznia | 45 s, sektory po 15 s | Ciężkie kule, pod koniec pierwsze rykoszety |
| Rykoszet | 60 s, sektory po 20 s | Kwadratowe pociski, jeden przewidywalny odskok od ściany |
| Mechanizm | 75 s, sektory po 25 s | Opadające koła zębate z wahadłowym ruchem i mieszane sekwencje |
| Maraton | Finał w 240 s, potem bez końca | Zmienny układ, sektory po 30 s |

Tłocznia i Maraton są dostępne od początku. Ukończenie krótkiej trasy odblokowuje następną. Trzy krótkie trasy mają stałe układy. Rewanż w Maratonie zachowuje ziarno; przycisk „Nowy układ Maratonu” losuje nowe. HUD poza areną pokazuje postęp całej trasy oraz znacznik rekordu, osobnego dla trasy i stylu.

Przeszkody mają zaplanowane wejścia i sekundową zapowiedź toru. Rozbicie nie przyspiesza następnego wejścia. Maksymalnie trzy zagrożenia, różne promienie kolizji dla trzech rodzin. Zmiana sektora zachowuje istniejące przeszkody, ciastko i wszystkie zegary; nowe wzory obowiązują kolejne wejścia. Tła przenikają się, bez dodatkowej ochrony.

Po porażce można wybrać **Trening fragmentu**. Odtwarza pełny stan początku bieżącego sektora: pozycje, zegary, cechy, moce, energię, pióro i kurs harmonogramu. Kończy się na następnej granicy sektora. Nie daje okruchów, rekordów ani odblokowań. Spacja powtarza fragment, „Normalna próba” wraca do pełnej trasy.

## Zdolności, cechy i kombinacje

Zwykłe ciastko daje +1 energii, bliski unik +2, rozbicie poza aktywną zdolnością +1. Bazowy próg to 6. **Pełny pasek czeka na następne bezpośrednio zebrane ciastko**, które uruchamia moc na 4 s. Potem jest 8 s przerwy, bez gromadzenia energii.

| Styl | Zdolność |
|---|---|
| Rozbijacz (`guard`) | Kontakt rozbija przeszkody. Kolce pozostają groźne. |
| Łakomczuch (`collector`) | Punkty ×2, każde bezpośrednie ciastko rozbija najbliższą przeszkodę w promieniu 70. |
| Władca czasu (`time`) | Przeszkody, zegar trasy i rytm zwalniają do połowy. Sterowanie i czas zdolności pozostają bez zmian. |

Unik wymaga minięcia w odległości 45–69 między środkami, następnie oddalenia ponad 84. Daje jeden punkt i odświeża istniejącą serię, również podczas przerwy zdolności; każda przeszkoda nagradza raz. Kontakt i ratunek wykluczają unik.

Maksymalnie trzy cechy, każda do poziomu 2. Przelot przez romb wybiera opcję; drugą można ominąć. Brak pauzy. Oferty mają 0,9 s zapowiedzi i 8 s na wybór; brak bezpiecznego miejsca odracza je najwyżej o 3 s, następnie pomija. Nie przesuwają obiektów. Pierwsza oferta Tłoczni uczy Baterii i Pęknięcia.

| Cecha | Poziom 1 / 2 |
|---|---|
| Bateria ϟ | Próg energii 5 / 4 |
| Odłamki ✦ | Rozbicie zbiera istniejące ciastko w promieniu 90 / 130 |
| Pęknięcie ◎ | Unik osłabia miniętą przeszkodę; poziom 2 także jedną sąsiednią w promieniu 80. Dotyk osłabionej przeszkody bezpiecznie ją rozbija. |
| Echo ↯ | Rozbicie niszczy jedną kolejną przeszkodę w promieniu 70 / 100 |
| Kieszeń ◈ | Jednorazowo przedłuża kończącą się serię o 2 / 3 s. Odnawia się po 6 ciastkach. |
| Dogrywka ◷ | Zdolność dłuższa o 0,5 / 1 s; odblokowanie za 10 bonusów łącznie |

Łańcuch jednego zdarzenia rozbija najwyżej dwie przeszkody i zbiera najwyżej jedno istniejące ciastko. Odłamki nie aktywują czekającej zdolności ani impulsu Łakomczucha. Nie ma rekurencyjnego farmienia nowo powstałych ciastek. Szczegółowe opisy są w rozwijanej sekcji Gniazda.

Oferty w sekundach zegara trasy: Tłocznia 6/18/30; Rykoszet 6/20/34/48; Mechanizm 6/19/32/45/58/66; Maraton 8/35/70/105/140/175/210.

## Power-upy i seria

Pierwszy bonus może pojawić się po trzech ciastkach i 8 s. Następne wymagają co najmniej siedmiu kolejnych ciastek i 12 s od poprzedniej oferty. Najwyżej dwie aktywne moce; bez oferowania odświeżenia aktywnej. Okrągły bonus po 8 s zmienia się w zwykłe ciastko w tym samym miejscu.

- Tarcza: 5 s, sygnalizuje ostatnie 2 s i cicho buczy. Rozbija przeszkody, nie chroni przed kolcami.
- Spowolnienie: 6 s. Zwolnienie świata wynosi najwyżej połowę, bez mnożenia spowolnień.
- Magnes: 6 s, zasięg 90.
- Podwójne punkty: 8 s, bez mnożenia waluty i liczby fizycznych ciastek.

Ciastka co najwyżej co 4 s utrzymują serię. Co trzecie podnosi mnożnik, maksymalnie ×4. Rozbicie i unik odświeżają istniejącą serię. Łakomczuch + podwójne punkty + seria daje najwyżej 16 punktów za ciastko.

## Zapis i postęp

Profil `ciastkobranie.profile.v1` zachowuje stary portfel, zakupy, styl, wygląd, odblokowania i historyczny rekord. Nowe rekordy są rozdzielone według trasy i stylu. Dawny zwycięzca Maratonu ma dostęp do wszystkich tras, ale bez fikcyjnych zaliczeń. Zablokowana pamięć pozwala rozwijać profil w bieżącej sesji.

- Jedno ciastko = jeden okruch; ukończony sektor = trzy dodatkowe. Rozliczenie jest jednorazowe, zwycięstwo zapisuje się natychmiast.
- 40 ciastek łącznie odblokowuje Ostatnie pióro. Widoczny symbol przygasa po zużyciu. Pióro zachowuje pozycję i lot, rozbija kontaktującą przeszkodę, a przy kolcach odbija ptaka od krawędzi. Daje 1,2 s ratunkowej osłony.
- Złoty wygląd za zwycięstwo; miętowy za serię 20. Po zaliczeniu Tłoczni / Rykoszetu / Mechanizmu można kupić Miedziany / Kobaltowy / Grafitowy za 100 / 150 / 200 okruchów. To barwa sprite’a, bez zmiany mechaniki.
- Stałe zakupy: chwyt +3/+6 (20/50), czas bonusów +5/+10% (20/50), startowa tarcza 1/1,5 s (30/60).
- „Ostatnia runda” zapisuje lokalnie czas pierwszej cechy, widziane i zebrane oferty, czas rewanżu, uniki, zdolności, ratunki, czas ochrony i przyczynę końca. Bez telemetrii sieciowej.

## Oprawa i wydajność

Canvas 2D pozostaje rendererem: przy tej skali migracja silnika nie daje potwierdzonej korzyści. Buforowane tła, sprite’y, kształty przeszkód i poświaty; HUD aktualizuje tylko zmienione wartości. Fizyka 60 Hz, renderowanie przez requestAnimationFrame bez limitu 30 fps, DPR najwyżej 2. Budżet: 100 cząstek, 12 pierścieni, 16 głosów audio. Krótkie wstrząsy przy rozbiciu, mocniejsza reakcja śmierci; obrót kamery tylko podczas śmierci. Ograniczony ruch wyłącza wstrząsy i przenikanie.

Syntezowany rytm 120 BPM podąża za zegarem trasy, także przy spowolnieniu. Nie kwantyzuje sterowania. Rodziny przeszkód mają osobne zapowiedzi i brzmienia rozbicia. Pauza i wyciszenie zatrzymują dźwięki; brak audio nie przerywa gry.

- `?perf=1`: rzeczywisty FPS, koszt rysowania i największa przerwa.
- `?seed=123`: powtarzalny Maraton.
- `?debug=1`: promienie kolizji.

Testy obejmują harmonogramy, tysiąc ziaren Maratonu, ciągłość sektorów, limity kombinacji, moce, trening, zapis i migrację oraz kontroler przeglądarkowy. Wyszukiwanie sekwencji skoków wyznacza przejście każdej krótkiej trasy; odtworzenie w rzeczywistym modelu sprawdza je dla trzech stylów bez przesuwania ptaka lub usuwania przeszkód. Potwierdza osiągalność, nie subiektywną trudność ani przyjemność gry.

Cel 60 fps wymaga 60 wywołań od przeglądarki. W użytym środowisku także pusta strona otrzymywała około 30; nie deklarujemy pomiaru 60 fps. Balans i czytelność w szybkiej grze wymagają dalszego ogrania przez człowieka.

## Pliki

`courses.js` — trasy i układy ciastek; `director.js` — harmonogram wejść; `obstacles.js` — trajektorie; `game-model.js` — fizyka i reguły; `progression.js` — profil; `game.js` — sterowanie, dźwięk i Canvas; `test/helpers/reachability.js` — wyszukiwanie przejść.

Gałęzie: `codex/arcade-checkpoint` zachowuje poprzedni prototyp, `codex/mastery-sectors` zawiera tę iterację. Główna gałąź pozostaje bez zmian.
