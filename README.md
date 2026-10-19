# Drzazgi — piracki multiplayer w pixel arcie

Otwarte, losowo generowane morze, po którym pływasz razem z innymi kapitanami. Rozbudowujesz okręt
jak najbardziej się da, zatapiasz rywali i siejesz strach na morzach. **Masz jedno życie** — gdy okręt
pójdzie na dno, tracisz wszystko i zaczynasz od tratwy.

## Rozgrywka

- **Otwarty świat** 4000×4000: 8 portów, ~60 wysp, trzy strefy — *Spokojne Wody*, *Szerokie Morze*
  i *Diabelskie Głębiny*. Im dalej od środka, tym bogatsze łupy i groźniejsi piraci.
- **Złoto** za zatapianie okrętów (graczy i piratów) oraz z dryfujących **beczek i skrzyń** — rozbij je
  kulą albo taranem, a potem podpłyń po złoto lub przedmiot. Beczki prochu wybuchają.
- **Stocznia w porcie** (klawisz `B`): kupujesz części, ładownia przechowuje łupy, zniszczone części
  naprawiasz za ćwierć wartości. W porcie (przerywany krąg) nikt nie może Cię skrzywdzić.
- **Materiały kadłuba**: sosna, dąb, mahoń, żelazo, stal i upiorne drewno (tylko z łupów).
- **Bronie**: armata, długie działo, karonada (śrut), smocze działo (podpala), działo łańcuchowe
  (potrójne obrażenia masztom i wiosłom), krętlica (strzela sama), moździerz, taran.
- **Jakość części**: zwykła, solidna, mistrzowska, legendarna, upiorna. Lepsza jakość to więcej obrażeń,
  szybsze ładowanie i większa wytrzymałość, a do tego inny wygląd — lufy z żeliwa, stali, brązu, złota
  i upiornej zieleni, coraz większe i barwniejsze żagle. W porcie kupisz do jakości mistrzowskiej, resztę
  zdobywasz w boju.
- **Minimapa** po prawej pokazuje każdego gracza i jego siłę (★ i kolor kropki); najsilniejszy nosi
  **koronę Postrachu Mórz** — za jego zatopienie jest +150 złota.
- **Zdarzenia**: Statek Widmo (legendarne i upiorne łupy), Złoty Galeon (ucieka z ładownią złota),
  wędrujący Sztorm z piorunami, Dryfujący Skarb.
- Cykl dnia i nocy, czat, kronika zatopień, sala sławy najlepszych żyć.

### Sterowanie

| Akcja | Klawisz |
|---|---|
| Żagle | `W` / `S` |
| Skręt | `A` / `D` |
| Salwa lewą / prawą burtą | `Q` / `E` |
| Moździerz i działa dziobowe | `Spacja` |
| Stocznia (w porcie) | `B` |
| Mapa / lista graczy | `M` / `Tab` |
| Czat | `Enter` |

Pad też działa (krzyżak/gałka, LB/RB, A, Y — stocznia, BACK — mapa).

## Uruchomienie lokalne

```bash
npm install
npm start          # http://localhost:3000
```

Bez serwera (otwarcie `public/index.html` z dysku) działa tryb **offline** — ten sam świat liczy się
wtedy w przeglądarce, z botami.

## Docker

```bash
docker compose up --build    # http://localhost:3000
```

albo bez compose:

```bash
docker build -t drzazgi .
docker run -p 3000:3000 -v drzazgi-data:/app/data drzazgi
```

## Wdrożenie na Coolify

1. **New Resource → Public/Private Repository**, wskaż to repozytorium i gałąź.
2. **Build Pack: Dockerfile** (plik `Dockerfile` jest w katalogu głównym).
3. **Ports Exposes: `3000`**.
4. Ustaw domenę (np. `https://drzazgi.twojadomena.pl`). WebSocket działa pod tą samą domeną
   (`/ws`) — proxy Coolify przepuszcza go bez dodatkowej konfiguracji.
5. (Opcjonalnie) **Storages → Add volume** z docelową ścieżką `/app/data`, żeby sala sławy
   przetrwała restarty i aktualizacje.
6. (Opcjonalnie) zmienne środowiskowe z tabeli niżej.
7. **Deploy**. Obraz ma wbudowany `HEALTHCHECK` (`/health`), więc Coolify widzi, kiedy serwer wstał.

Zamiast Dockerfile można też wybrać build pack **Docker Compose** — `docker-compose.yml` jest gotowy.

### Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `3000` | port HTTP i WebSocket |
| `MAX_PLAYERS` | `40` | limit graczy jednocześnie |
| `NPC_COUNT` | `9` | ile pirackich okrętów pływa po świecie (mniej, gdy graczy przybywa) |
| `WORLD_SEED` | losowy | stała mapa świata |
| `DATA_DIR` | `/app/data` | gdzie zapisywać salę sławy |

Adresy pomocnicze: `GET /health` (zwraca `ok`) i `GET /status` (gracze online, sala sławy).

## Jak to działa

- **Serwer autorytatywny** (`server/index.js`, Node + [`ws`](https://github.com/websockets/ws)):
  symuluje świat 30 razy na sekundę i 15 razy na sekundę wysyła każdemu graczowi migawkę tego,
  co jest w jego pobliżu. Klient wysyła tylko wejście (żagle, ster, salwy, operacje stoczni).
- **Wspólny kod** w `public/shared/` — definicje części, zasady stoczni, fizyka okrętu i cała
  symulacja świata. Ten sam kod działa na serwerze (ładowany przez `server/load-shared.js`)
  i w przeglądarce w trybie offline.
- **Klient** (`public/js/`) interpoluje pozycje między migawkami, a efekty (kule, trafienia,
  wybuchy) odtwarza dokładnie w chwili, w której zaszły na serwerze.
- Rozłączenie nie zatapia okrętu od razu: przez kilkanaście sekund (dłużej w trakcie walki) możesz
  wrócić tym samym okrętem po odświeżeniu strony.

## Testy

```bash
npm test     # symulacja świata + test sieciowy z prawdziwym serwerem i dwoma klientami
```
