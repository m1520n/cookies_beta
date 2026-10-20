# Ciastkobranie

Arcade jednym przyciskiem, napisane w JavaScript i Canvas 2D. Główny tryb **Łasuch**: zbieraj, utrzymuj serię, przygotuj Szał i przez chwilę poluj na przeszkody. Dotychczasowe trasy i Maraton pozostają w menu **Wyzwania**.

## Uruchomienie

```sh
npm start
# http://localhost:8000
npm test
```

Bez zależności i budowania. Python 3 do serwera, Node.js 18+ do testów. Moduły wymagają HTTP; gra nadaje się do GitHub Pages.

Klik / dotyk / spacja — skok. Esc — pauza. Ukrycie karty zatrzymuje grę. Śmierć ma krótki hitstop i zwolniony upadek: 0,35 s dla prób krótszych niż 15 s, potem 0,7 s. Już po 0,12 s świeże naciśnięcie rozpoczyna rewanż, bez obowiązkowego ekranu wyników.

## Łasuch — główny tryb

Lot bez końca, po osobny rekord. Sterowanie i fizyka pozostają takie same jak w Wyzwaniach. W tym prototypie każdy startuje z równymi parametrami: bez kart, stylów, losowych power-upów, zakupionych ulepszeń i pióra. Wybrany wygląd ptaka nadal działa.

- Zwykłe ciastko: 1 punkt bazowy i 1 ładunek. Złote: 3 punkty bazowe i 2 ładunki. Złota okazja pojawia się, gdy środek aktywnej przeszkody jest 70–120 jednostek od środka ciastka. Zmienia kolor i obwódkę, bez zmiany położenia.
- Ciastka utrzymują serię przez 4 s; każde trzecie podnosi mnożnik, maksymalnie do ×4. Wygaśnięcie zeruje serię, ale zachowuje wynik. Bliski unik nie daje punktów ani energii; odświeża istniejącą serię.
- Cztery ładunki przygotowują **Szał**. Dopiero następne ciastko go uruchamia. Gotowość czeka na gracza.
- Szał trwa 3 s: ciastka dają punkty ×2, kontakt rozbija przeszkody za 2 punkty bazowe × mnożnik serii i odnawia czas serii. Kolce nadal zabijają.
- W czasie Szału nie ma złotych okazji ani ładowania kolejnego Szału. Następnie 4 s przerwy przed ładowaniem. Mocy nie można kumulować lub przedłużać.
- HUD: wynik, zegar serii, mnożnik i cztery segmenty Szału. Wynik końcowy zawiera punkty, rekord i rewanż; bez listy statystyk.
- Pierwsze 15 s: kule; następne 15 s: rykoszety; kolejne 15 s: wahadła. Potem mieszane sektory po 15 s. Odstęp wejść 2,5 / 2,5 / 2,25 / 2 s, później stały; maksymalnie trzy zagrożenia. Świat płynnie trwa przez zmianę sektora, bez komunikatów o levelach.
- Każde fizyczne ciastko daje jeden okruch; złoty bonus, mnożniki, rozbicia i przeżyte sektory nie mnożą waluty. Śmierć nie zabiera zarobionych okruchów. Rewanż zachowuje ziarno.

Dotychczasowy profil jest migrowany raz do domyślnego Łasucha. Późniejszy wybór Wyzwania jest zapamiętywany. Historyczne rekordy, portfel, zakupy i odblokowania pozostają zachowane; rekord Łasucha jest osobny i niezależny od stylu. W metrykach ostatniej rundy zapisują się także złote ciastka, rozbicia i czas pierwszego Szału, lokalnie i bez wysyłania danych.

Dalsze sekcje opisują **Wyzwania**; ich moce, cechy, ulepszenia i nagrody sektorowe nie obowiązują w Łasuchu.

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

Testy obejmują harmonogramy, tysiąc ziaren Maratonu, ciągłość sektorów, limity kombinacji, moce, trening, zapis i migrację oraz kontroler przeglądarkowy. Wyszukiwanie sekwencji skoków wyznacza przejście każdej krótkiej trasy; odtworzenie w rzeczywistym modelu sprawdza je dla trzech stylów bez przesuwania ptaka lub usuwania przeszkód. Osobne wyszukiwanie wejść odtwarza w rzeczywistym modelu Łasucha zebranie złotej okazji, uruchomienie Szału i rozbicie zaplanowanej przeszkody; dla ziarna 42 pierwsza moc wystąpiła po około 4,2 s, a pełna pętla po 5,4 s. Testy potwierdzają osiągalność, nie subiektywną trudność ani przyjemność gry. Po pięciu próbach należy ocenić, czy gracz szuka okazji, wyczekuje Szału i ma pomysł na kolejny rewanż.

Fizyka pozostaje przy 60 Hz niezależnie od częstotliwości renderowania. Wcześniejsza sesja przeglądarki dostarczała około 30 fps; po zmianie środowiska podgląd Łasucha pokazywał około 120 fps. Wynik nie stanowi gwarancji dla innych urządzeń. Balans i czytelność w szybkiej grze wymagają dalszego ogrania przez człowieka.

## Pliki

`courses.js` — trasy i układy ciastek; `director.js` — harmonogram wejść; `obstacles.js` — trajektorie; `game-model.js` — fizyka i reguły; `progression.js` — profil; `game.js` — sterowanie, dźwięk i Canvas; `test/helpers/reachability.js` — wyszukiwanie przejść.

Gałęzie: `codex/arcade-checkpoint` zachowuje wcześniejszy prototyp, `codex/mastery-sectors` trasy i sektory, a `codex/greed-arcade` główny tryb Łasuch. Główna gałąź pozostaje bez zmian.
