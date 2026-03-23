# AZ-kvíz-up – Návod a pravidla hry

## 👑 Cíl hry

Tým vyhrává, jakmile dokáže **propojit svou startovní stranu šestiúhelníku s přesným středem** hracího pole (♥ **Srdce plástve**). Musí tedy vytvořit nepřerušenou linii vlastních políček od okraje ke středu.

Pokud se to nepodaří nikomu (otázky dojdou nebo vyprší čas), vyhrává tým s **nejvíce políčky** – tento stav moderátor vyhlásí tlačítkem 📊 **Nadvláda**.

---

## 🛠️ Příprava hry

### 1. Otázky (CSV soubory)
Připravte jeden nebo více CSV souborů. Každý soubor = jedna kategorie otázek. Formát:

```
Otázka,Odpověď,Typ,Obrázek
Co je hlavní město ČR?,Praha,normal,
Vyjmenujte státy EU (Duel),Německo / Francie...,duel,
```

- Typ `normal` = klasická otázka
- Typ `duel` = speciální otázka pro duel/aukci
- Sloupec Obrázek je nepovinný (URL nebo relativní cesta)

### 2. Nastavení (Setup obrazovka)
- **Poloměr plánu** – čím vyšší, tím větší plán (doporučeno 3–4)
- **Čas na odpověď** – viditelná časomíra v okně otázky
- **Power-upy** – kolik tajných políček moderátor může umístit
- **Týmy** – 2 až 6 týmů; každý automaticky dostane jednu stranu šestiúhelníku

### 3. Tajná políčka (Power-up placement)
Moderátor vidí prázdný plán a **klikáním přiřazuje power-upy** na vybraná políčka. Tuto obrazovku se **nepromítá** – je jen pro moderátora. Typy power-upů:

| Ikona | Název | Efekt |
|---|---|---|
| 🛡️ | **Štít** | Uloží se týmu. Lze použít k zablokování jednoho útoku (Duelu). |
| 💣 | **Bomba** | Uloží se týmu (životnost 3 tahy). Tým si sám vybere, které políčko soupeře zničí. |
| 👻 | **Duch** | Uloží se týmu (životnost 3 tahy). Tým ukradne jedno sousední políčko soupeře bez otázky. |
| 🕸️ | **Pavučina** | Okamžitá past – tým ztrácí příští tah. |

---

## 🎲 Průběh tahu

Týmy se střídají automaticky (lze vypnout tlačítkem **🔄 Auto-střídání**).

### Výběr políčka
Tým (resp. moderátor za něj) klikne na **volné políčko** na plánu.

### Otázka
- Moderátor přečte otázku nahlas
- Běží viditelná **časomíra**
- Kliknutím **👁 Zobrazit odpověď** odhalí správnou odpověď (vidí jen moderátor na laptopu)

### Výsledek
| Výsledek | Co se stane |
|---|---|
| ✅ **Správně** | Políčko se obarví barvou týmu |
| ❌ **Špatně** | Políčko zešedne (Rozstřel) |

Po vyhodnocení se automaticky přepne na další tým.

---

## ⚔️ Útok (Duel o políčko soupeře)

Místo výběru volného políčka může tým **zaútočit na sousední políčko soupeře**.

**Podmínka:** Napadené políčko musí **přímo sousedit** s alespoň jedním vlastním políčkem.

**Postup:**
1. Moderátor zapne **⚔️ Útokový režim** v panelu akcí
2. Klikne na sousední políčko soupeře
3. Moderátor přečte **Duelovou otázku** (typ `duel` z CSV)
4. Vyhodnotí pomocí tlačítek se jmény týmů, kdo odpověděl lépe

| Výsledek duelu | Co se stane |
|---|---|
| Útočník vyhrál | Políčko se přebarví na barvu útočníka |
| Obránce ubránil | Políčko zůstává, útočník promarnil tah |

> **Pozor:** Na jedno políčko lze zaútočit maximálně **2×**. Po druhém útoku se zobrazí 🔒 a políčko se stává **nedobytným**.

---

## 🎯 Rozstřel (šedá políčka)

Pokud tým klikne na **šedé políčko** (dříve zodpovězené špatně), nečte se klasická otázka.

Moderátor přečte otázku a **všechny týmy mohou vykřiknout odpověď**. Kdo je nejrychleji správně, políčko bere.

> Pokud se někdo unáhlí a odpoví špatně, pro toto kolo z Rozstřelu vypadává.

---

## ⚡ Power-upy (použití)

Když tým správně odpoví na otázku u políčka s power-upem, power-up se aktivuje:

- **🛡️ Štít** – přidá se do inventáře (zobrazí se jako odznak u týmu). Při útoku na tým stačí říct „použijeme štít" – moderátor pak neotevírá Duel.
- **💣 Bomba / 👻 Duch** – zobrazí se jako klikatelný odznak (např. `💣×3`). Moderátor klikne → otevře se picker s výběrem políčka. **Životnost 3 tahy** (po 3 tazích daného týmu bez použití vyprší).
- **🕸️ Pavučina** – tým okamžitě přichází o příští tah.

---

## 🎨 Moderátorský přiřazovací režim

Pro ruční opravy a výjimky. Zapnout tlačítkem **🎨 Přiřadit políčko**.

V tomto režimu kliknutí na jakékoli políčko otevře dialog pro přiřazení týmu – bez otázky, bez časomíry.

---

## 🔧 Moderátorský panel

Plovoucí panel vlevo dole (ikona 🔧 vpravo nahoře). Zobrazuje:
- Mini mapa s pozicemi power-upů (tajná, nepromítá se)
- Odpověď aktuální otázky

---

## 📊 Konec hry

**Vítěz spojením:** Tým propojí startovní stranu s ♥ středem – hra okamžitě skončí.

**Vítěz nadvládou:** Moderátor klikne 📊 **Nadvláda (výsledky)** – zobrazí pořadí podle počtu vlastněných políček.

---

## 💡 Tipy pro moderátora

- Nezapomínejte **nesdílet obrazovku** při zadávání tajných políček (power-up placement)
- Tlačítko **→ Další tah ručně** použijte, pokud chcete přeskočit tým nebo změnit pořadí
- Power-upy lze použít i mimo kolo – klikněte na odznak v scoreboardu kdykoliv
- V útočném a přiřazovacím režimu se vzájemně vylučují (nelze oba najednou)
