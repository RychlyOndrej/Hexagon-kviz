# AZ-kvíz-up ⬡

Hexagonální kvízová hra pro 2–6 týmů inspirovaná pořadem Máme rádi Česko. Aplikace běží kompletně offline v prohlížeči – žádná instalace, žádný server.

## Spuštění

1. Stáhněte složku `az-kviz-up/`
2. Otevřete `index.html` dvojklikem v prohlížeči

## Funkce

| Funkce | Popis |
|---|---|
| ⬡ Hexagonální plán | Nastavitelný poloměr 2–6 prstenů (7–127 políček) |
| 👥 Týmy | 2–6 týmů, vlastní názvy a barvy, automatické přidělení stran |
| 📂 Otázky | Více CSV souborů (každý = kategorie), podpora obrázků |
| ⏱ Časomíra | Nastavitelná (5–120 s), viditelná i v otázkovém modálu |
| ⚔️ Útoky | Duel o sousední políčko soupeře |
| 🎯 Rozstřel | Aukce o šedá (nesprávně zodpovězená) políčka |
| ⚡ Power-upy | 🛡️ Štít · 💣 Bomba · 👻 Duch · 🕸️ Pavučina – s inventářem a životností |
| 🎨 Přiřazení | Moderátorský režim pro ruční přepisování políček |
| 🔄 Auto-střídání | Automatické přepínání týmů po každé odpovědi |
| 🏆 Vítěz | Propojení startovní strany se středem (♥ Srdce plástve) |

## Formát otázkového souboru (CSV)

```
Otázka,Odpověď,Typ,Obrázek
Jaké je hlavní město ČR?,Praha,normal,
Vyjmenujte státy EU (duel),Německo / Francie / ...,duel,
Kde leží Sněžka?,Krkonoše,normal,https://url-obrazku.jpg
```

**Sloupce:**
- `Otázka` – text otázky
- `Odpověď` – správná odpověď (zobrazí moderátorovi)
- `Typ` – `normal` nebo `duel`
- `Obrázek` – URL nebo relativní cesta (nepovinné)

Součástí balíčku je 5 vzorových CSV souborů (zeměpis, historie, příroda, kultura, sport) s 15 otázkami každý.

## Soubory

```
az-kviz-up/
├── index.html              # hlavní aplikace
├── style.css               # design
├── game.js                 # herní logika
├── NAVOD.md                # pravidla hry
├── otazky_zemeopis.csv     # vzor – Zeměpis
├── otazky_historie.csv     # vzor – Historie
├── otazky_priroda.csv      # vzor – Příroda
├── otazky_kultura.csv      # vzor – Kultura
└── otazky_sport.csv        # vzor – Sport
```

## Nastavení hry (rychlý přehled)

1. **Nastavení** – poloměr plánu, čas na odpověď, počet power-upů, týmy, CSV soubory
2. **Tajná políčka** – moderátor umístí power-upy na plán (publikum nevidí)
3. **Hra** – týmy se střídají, moderátor kliká na políčka a vyhodnocuje odpovědi

Viz `NAVOD.md` pro kompletní pravidla.
