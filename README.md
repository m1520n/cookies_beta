# Ciastkobranie

Arcade jednym przyciskiem: buduj zestaw wybierając ulepszenia torem lotu, uruchamiaj krótkie zdolności i przetrwaj czterominutowy finał. Runda nie zatrzymuje się na wybory ani komunikaty.

## Uruchomienie

```sh
python3 -m http.server 8000
# http://localhost:8000
npm test
```

Bez zależności i budowania; Node.js 18+ do testów. Moduły wymagają serwera HTTP. Pliki można publikować na GitHub Pages.

Klik / dotyk / spacja — skok. Esc — pauza. Zmiana karty zatrzymuje grę. Po śmierci jest około 1,2 s zwolnionej animacji; od 0,35 s osobnym naciśnięciem można ją pominąć. Kolejne naciśnięcie uruchamia następną próbę. Dźwięk i ograniczony ruch są respektowane.

## Ciągły lot i finał

- Sektor zmienia się co 30 s aktywnego lotu. Nie zależy od punktów ani ciastek.
- Zmiana sektora zachowuje pozycje, prędkości i zegary obiektów. Nie daje nietykalności. Tła przenikają się przez 1,2 s; numer sektora pojawia się na 0,8 s.
- Nowe wzory obowiązują przy kolejnych wejściach piłek. Dodawane sloty mają pełną zapowiedź. Maksymalnie są trzy piłki; prędkość bazowa rośnie najwyżej o 25%.
- Generator sprawdza wolną przestrzeń dla różnych współistniejących wzorów. Ostrzeżenie trwa minimum 0,6 s, pierwszy nowy wzór minimum 0,9 s; w razie potrzeby zrzut jest opóźniany.
- Od 210 do 240 s trwa finał: naprzemienne pionowe zrzuty, skosy i pary — po 10 s. Istniejące piłki kończą swój lot.
- Przetrwanie do 240 s zapisuje zwycięstwo od razu, dokładnie raz. Gra automatycznie płynie dalej po rekord, ze zmianą sektora co 30 s.

## Zdolności i energia

W Gnieździe przed rundą wybiera się fundament zestawu. Ciastko daje +1 energii, bliski unik +2, rozbicie piłki poza zdolnością +1. Bazowy próg wynosi 6. Pełny pasek automatycznie uruchamia zdolność na 4 s, potem następuje 8 s przerwy. W czasie zdolności i przerwy energia nie narasta ani nie zapisuje się na później.

| Styl | Zdolność |
|---|---|
| Rozbijacz (zachowane ID `guard`) | Rozbija dotykane piłki. Kolce pozostają groźne. |
| Łakomczuch | Podwaja punkty za ciastka, również w połączeniu z serią i mocą ×2. |
| Władca czasu | Piłki poruszają się z połową prędkości, sterowanie ptakiem bez zmian. Spowolnienia nie mnożą się. |

Bliski unik wymaga przejścia piłki w odległości 45–69 jednostek między środkami i późniejszego oddalenia ponad 84. Każdy przelot może przyznać energię raz. Piłka dotknięta, rozbita lub uruchamiająca ratunek nie daje nagrody za unik. Piłka jest recyklingowana dopiero po całkowitym opuszczeniu dolnej krawędzi, z marginesem na rozliczenie minięcia.

## Trzy miejsca na cechy

Oferty pojawiają się w sekundach 25, 60, 95, 130, 165 i 200. Dwa romby przedstawiają różne cechy. Przeleć przez jeden, aby go wybrać; drugi znika. Oba można ominąć. Oferta ma zapowiedź 0,9 s i 8 s na zebranie. Nie jest przyciągana przez magnes.

Pozycje są w zasięgu 160 od ptaka, przynajmniej 65 od ciastka oraz poza przewidywaną bliskością piłek przy aktywacji. Brak bezpiecznej pozycji odracza ofertę do 3 s, następnie ją pomija. Nie przesuwa ciastek ani zagrożeń. Losowanie cech korzysta z osobnego generatora zależnego od ziarna, niezależnego od efektów graficznych.

Maksymalnie trzy różne cechy, każda do poziomu 2. Gdy miejsca są pełne, kolejne oferty ulepszają posiadane cechy. Przy jednej możliwej opcji jest jeden romb; po wyczerpaniu ulepszeń oferty się nie pojawiają.

| Cecha | Symbol | Poziom 1 / 2 |
|---|---|---|
| Bateria | ϟ | Próg aktywacji 5 / 4 energii |
| Odłamki | ✦ | Rozbita piłka zbiera istniejące ciastko w promieniu 90 / 130 |
| Naprzemiennik | ↔ | Ciastko po przeciwnej stronie niż poprzednie: dodatkowe +1 / +2 energii |
| Precyzja | ◎ | Unik: dodatkowe +1 / +2 energii |
| Dynamo | ⚙ | Rozbicie poza zdolnością: dodatkowe +1 / +2 energii |
| Dogrywka | ◷ | Dodatkowe 0,5 / 1 s zdolności; odblokowanie za 10 bonusów łącznie |

Opisy są w rozwijanej sekcji Gniazda; w locie pojawia się tylko krótka nazwa z symbolem. Nie ma automatycznych cech za zmianę sektora. Fragmenty są dekoracyjne, a rozbicie i wynikające z niego zebranie są jednorazowe. Zestaw nie może ładować własnej aktywnej zdolności.

## Power-upy i serie

Pierwszy bonus może pojawić się po trzech ciastkach i 8 s lotu. Następne wymagają minimum siedmiu kolejnych ciastek i 12 s od poprzedniej oferty. Przy dwóch aktywnych mocach generator czeka. Nie oferuje odświeżania aktywnej mocy. Pierwszy bonus daje tarczę; kolejne korzystają z tasowanej puli bez bezpośrednich powtórek.

Okrągłe bonusy są dostępne 8 s, potem zmieniają się w zwykłe ciastko w tym samym miejscu:

- Tarcza: 5 s; ostrzega przez ostatnie 2 s, rozbija piłki, nie chroni przed kolcami.
- Spowolnienie: 6 s połowy prędkości piłek, bez zmiany sterowania.
- Magnes: 6 s zbierania ciastek w promieniu 90, z widocznym przelotem do ptaka.
- Podwójne punkty: 8 s; nie zwiększa liczby fizycznych ciastek ani waluty.

Przerwy między ciastkami krótsze niż 4 s utrzymują serię. Co trzecie ciastko podbija mnożnik do maksymalnie ×4. Rozbicie piłki odnawia zegar istniejącej serii, ale samo nie daje punktów ani okruchów. Łakomczuch z aktywną zdolnością, mocą ×2 i serią ×4 otrzymuje maksymalnie 16 punktów za ciastko. Pauza zamraża zegary.

## Gniazdo i zgodność zapisu

Rekord, okruchy, styl, dotychczasowe zakupy i odblokowania pozostają w profilu `ciastkobranie.profile.v1`. Nowe pola mają domyślne wartości; nie resetują starego zapisu. Zablokowany zapis pozwala nadal grać i rozwijać profil w sesji.

- 40 zebranych ciastek łącznie odblokowuje Ostatnie pióro. Od kolejnej rundy daje jeden ratunek od początku, niezależnie od trzech miejsc na cechy. Złoty symbol przygasa po użyciu.
- Pióro rozbija kontaktującą piłkę, zachowując pozycję i lot ptaka; przy kolcach odbija go od krawędzi. Osłona ratunkowa trwa 1,2 s.
- Dawne odblokowanie Dobrej passy za 10 bonusów udostępnia Dogrywkę, z zachowanym ID `streak`.
- Pierwsze zwycięstwo odblokowuje złotą obwódkę ptaka. Najlepsza seria 20 ciastek odblokowuje miętową. Wygląd wybiera się w Gnieździe.
- Ciastko daje jeden okruch, ukończony sektor dodatkowe trzy. Rozliczenie po śmierci zapisuje się raz, osobno od zwycięstwa. Mnożniki nie zwiększają tych nagród.

Stałe ulepszenia nadal mają dwa poziomy:

| Ulepszenie | Efekt | Koszty |
|---|---|---|
| Pewniejszy chwyt | +3 / +6 zasięgu zwykłych ciastek | 20 / 50 |
| Dłuższa moc | +5% / +10% czasu zbieranych power-upów | 20 / 50 |
| Dobry start | 1 / 1,5 s tarczy na początku | 30 / 60 |

W rozwijanej sekcji „Ostatnia runda” są zapisane cechy, czas lotu, czas ochrony, czas z dwiema mocami, liczba uników, zdolności i ratunków oraz przyczyna śmierci. Dane pozostają lokalnie, bez telemetrii sieciowej.

## Oprawa, wydajność i weryfikacja

Świat reaguje wstrząsem, krótkim obrotem, fragmentami i dźwiękiem; HUD jest stabilny. Wspólny budżet to 100 cząstek, 12 pierścieni i 16 krótkich głosów audio. Tarcza ma cichy niski ton. Pauza, wyciszenie i śmierć zatrzymują dźwięki. Brak Web Audio lub nieznany dźwięk nie przerywa lotu.

Fizyka działa w 60 Hz. Renderowanie wykorzystuje requestAnimationFrame bez limitu 30 fps, DPR najwyżej 2, buforowane tła, poświaty, kolce i tekst HUD-u. Postęp sektora i energia są rysowane bez przebudowywania bufora tekstu. Przejście używa dwóch buforów tła. Ograniczony ruch wyłącza wstrząsy, obrót i przenikanie, pozostawiając informacje o zdarzeniach.

- `?perf=1`: rzeczywisty klatkaż, koszt rysowania i największa przerwa.
- `?seed=123`: powtarzalne ziarno układu i ofert przy tych samych działaniach gracza.
- `?debug=1`: promień kolizji ptaka.

Testy obejmują tysiąc ziaren zwykłych i mieszanych wzorów oraz ofert, ciągłość sektorów, kolizje, serie, limity cech, zdolności, całą czterominutową oś czasu dla trzech stylów, finał, dalszy lot, pauzę, zapis i migrację, wyciszenie oraz ograniczony ruch. Symulacja osi czasu kontroluje przeżycie i nie zastępuje ogrania balansu przez człowieka.

Cel 60 fps wymaga przeglądarki dostarczającej 60 klatek; w obecnym środowisku również pusta strona otrzymywała około 30. Koszt rysowania i limity efektów sprawdzamy osobno. Balans czterominutowego finału i subiektywna atrakcyjność kombinacji wymagają dalszego ogrania. Próba dnia i ranking sieciowy nie należą do tej iteracji.
