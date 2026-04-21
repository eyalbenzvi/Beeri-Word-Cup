// Top scorer candidates for FIFA 2026 World Cup
// 3-5 key forwards/attacking players per team
// `name` — English canonical name (stored value after selection).
// `nameHe` — Hebrew transliteration for search only; never persisted as a prediction.
export const TOP_SCORER_PLAYERS = [
  // Group A — MEX, RSA, KOR, CZE
  { team: "MEX", name: "Santiago Gimenez", nameHe: "סנטיאגו חימנס" },
  { team: "MEX", name: "Raul Jimenez", nameHe: "ראול חימנס" },
  { team: "MEX", name: "Hirving Lozano", nameHe: "אירווינג לוסאנו" },
  { team: "MEX", name: "Alexis Vega", nameHe: "אלכסיס וגה" },

  { team: "RSA", name: "Percy Tau", nameHe: "פרסי טאו" },
  { team: "RSA", name: "Lyle Foster", nameHe: "לייל פוסטר" },
  { team: "RSA", name: "Themba Zwane", nameHe: "תמבה זוואנה" },

  { team: "KOR", name: "Son Heung-min", nameHe: "סון הונג-מין" },
  { team: "KOR", name: "Hwang Hee-chan", nameHe: "הוואנג הי-צ'אן" },
  { team: "KOR", name: "Lee Kang-in", nameHe: "לי קאנג-אין" },
  { team: "KOR", name: "Cho Gue-sung", nameHe: "צ'ו גה-סונג" },

  { team: "CZE", name: "Patrik Schick", nameHe: "פטריק שיק" },
  { team: "CZE", name: "Adam Hlozek", nameHe: "אדם הלוז'ק" },
  { team: "CZE", name: "Mojmir Chytil", nameHe: "מויימיר חיטיל" },

  // Group B — CAN, BIH, QAT, SUI
  { team: "CAN", name: "Jonathan David", nameHe: "ג'ונתן דיוויד" },
  { team: "CAN", name: "Alphonso Davies", nameHe: "אלפונסו דייויס" },
  { team: "CAN", name: "Cyle Larin", nameHe: "סייל לארין" },
  { team: "CAN", name: "Tajon Buchanan", nameHe: "טאחון ביוקנן" },

  { team: "BIH", name: "Edin Dzeko", nameHe: "אדין דז'קו" },
  { team: "BIH", name: "Ermedin Demirovic", nameHe: "ארמדין דמירוביץ'" },
  { team: "BIH", name: "Smail Prevljak", nameHe: "סמאיל פרבליאק" },

  { team: "QAT", name: "Akram Afif", nameHe: "אכרם עפיף" },
  { team: "QAT", name: "Almoez Ali", nameHe: "אלמועז עלי" },
  { team: "QAT", name: "Hassan Al-Haydos", nameHe: "חסן אל-היידוס" },

  { team: "SUI", name: "Breel Embolo", nameHe: "ברל אמבולו" },
  { team: "SUI", name: "Noah Okafor", nameHe: "נואה אוקפור" },
  { team: "SUI", name: "Ruben Vargas", nameHe: "רובן ורגאס" },
  { team: "SUI", name: "Zeki Amdouni", nameHe: "זקי אמדוני" },

  // Group C — BRA, MAR, HAI, SCO
  { team: "BRA", name: "Vinicius Junior", nameHe: "ויניסיוס ג'וניור" },
  { team: "BRA", name: "Rodrygo", nameHe: "רודריגו" },
  { team: "BRA", name: "Raphinha", nameHe: "רפיניה" },
  { team: "BRA", name: "Endrick", nameHe: "אנדריק" },
  { team: "BRA", name: "Savinho", nameHe: "סאבינו" },

  { team: "MAR", name: "Youssef En-Nesyri", nameHe: "יוסף אן-נסירי" },
  { team: "MAR", name: "Hakim Ziyech", nameHe: "חכים זיאש" },
  { team: "MAR", name: "Sofiane Boufal", nameHe: "סופיאן בופאל" },
  { team: "MAR", name: "Brahim Diaz", nameHe: "בראהים דיאס" },

  { team: "HAI", name: "Frantzdy Pierrot", nameHe: "פרנצדי פיירו" },
  { team: "HAI", name: "Duckens Nazon", nameHe: "דוקנס נאזון" },

  { team: "SCO", name: "Che Adams", nameHe: "צ'ה אדמס" },
  { team: "SCO", name: "Lyndon Dykes", nameHe: "לינדון דייקס" },
  { team: "SCO", name: "Lawrence Shankland", nameHe: "לורנס שנקלנד" },

  // Group D — USA, PAR, AUS, TUR
  { team: "USA", name: "Christian Pulisic", nameHe: "כריסטיאן פוליסיץ'" },
  { team: "USA", name: "Folarin Balogun", nameHe: "פולארין בלוגון" },
  { team: "USA", name: "Timothy Weah", nameHe: "טימותי וואה" },
  { team: "USA", name: "Gio Reyna", nameHe: "ג'יו ריינה" },
  { team: "USA", name: "Ricardo Pepi", nameHe: "ריקרדו פפי" },

  { team: "PAR", name: "Miguel Almiron", nameHe: "מיגל אלמירון" },
  { team: "PAR", name: "Julio Enciso", nameHe: "חוליו אנסיסו" },
  { team: "PAR", name: "Adam Bareiro", nameHe: "אדם בארירו" },

  { team: "AUS", name: "Mathew Leckie", nameHe: "מתיו לקי" },
  { team: "AUS", name: "Mitchell Duke", nameHe: "מיטשל דיוק" },
  { team: "AUS", name: "Craig Goodwin", nameHe: "קרייג גודווין" },

  { team: "TUR", name: "Kerem Akturkoglu", nameHe: "כרם אקטורקואולו" },
  { team: "TUR", name: "Arda Guler", nameHe: "ארדה גולר" },
  { team: "TUR", name: "Baris Alper Yilmaz", nameHe: "באריש אלפר יילמאז" },
  { team: "TUR", name: "Yusuf Yazici", nameHe: "יוסוף יאזיג'י" },

  // Group E — GER, ECU, CIV, CUR
  { team: "GER", name: "Kai Havertz", nameHe: "קאי הברץ" },
  { team: "GER", name: "Florian Wirtz", nameHe: "פלוריאן ויירץ" },
  { team: "GER", name: "Jamal Musiala", nameHe: "ג'מאל מוסיאלה" },
  { team: "GER", name: "Leroy Sane", nameHe: "לרוי סאנה" },
  { team: "GER", name: "Niclas Fullkrug", nameHe: "ניקלאס פולקרוג" },

  { team: "ECU", name: "Enner Valencia", nameHe: "אנר ולנסיה" },
  { team: "ECU", name: "Kevin Rodriguez", nameHe: "קווין רודריגס" },
  { team: "ECU", name: "Gonzalo Plata", nameHe: "גונזאלו פלאטה" },

  { team: "CIV", name: "Sebastien Haller", nameHe: "סבסטיאן הלר" },
  { team: "CIV", name: "Nicolas Pepe", nameHe: "ניקולא פפה" },
  { team: "CIV", name: "Simon Adingra", nameHe: "סימון אדינגרה" },

  { team: "CUR", name: "Rangelo Janga", nameHe: "רנחלו ינחה" },
  { team: "CUR", name: "Kenji Gorre", nameHe: "קנג'י גורה" },

  // Group F — NED, JPN, SWE, TUN
  { team: "NED", name: "Cody Gakpo", nameHe: "קודי חאקפו" },
  { team: "NED", name: "Memphis Depay", nameHe: "ממפיס דפאי" },
  { team: "NED", name: "Xavi Simons", nameHe: "צ'אבי סימונס" },
  { team: "NED", name: "Brian Brobbey", nameHe: "בריאן ברובי" },

  { team: "JPN", name: "Takumi Minamino", nameHe: "טאקומי מינמינו" },
  { team: "JPN", name: "Kaoru Mitoma", nameHe: "קאורו מיטומה" },
  { team: "JPN", name: "Daichi Kamada", nameHe: "דאיצ'י קמאדה" },
  { team: "JPN", name: "Kyogo Furuhashi", nameHe: "קיוגו פורוהאשי" },

  { team: "SWE", name: "Alexander Isak", nameHe: "אלכסנדר איסאק" },
  { team: "SWE", name: "Viktor Gyokeres", nameHe: "ויקטור יוקרש" },
  { team: "SWE", name: "Dejan Kulusevski", nameHe: "דיאן קולוסבסקי" },
  { team: "SWE", name: "Anthony Elanga", nameHe: "אנתוני אלנגה" },

  { team: "TUN", name: "Youssef Msakni", nameHe: "יוסף מסקני" },
  { team: "TUN", name: "Aissa Laidouni", nameHe: "עיסא לעידוני" },
  { team: "TUN", name: "Seifeddine Jaziri", nameHe: "סייף א-דין ג'זירי" },

  // Group G — BEL, EGY, IRN, NZL
  { team: "BEL", name: "Romelu Lukaku", nameHe: "רומלו לוקאקו" },
  { team: "BEL", name: "Jeremy Doku", nameHe: "ג'רמי דוקו" },
  { team: "BEL", name: "Lois Openda", nameHe: "לואה אופנדה" },
  { team: "BEL", name: "Johan Bakayoko", nameHe: "יוהן בקאיוקו" },

  { team: "EGY", name: "Mohamed Salah", nameHe: "מוחמד סלאח" },
  { team: "EGY", name: "Omar Marmoush", nameHe: "עומר מרמוש" },
  { team: "EGY", name: "Mostafa Mohamed", nameHe: "מוסטפא מוחמד" },
  { team: "EGY", name: "Trezeguet", nameHe: "טרזגה" },

  { team: "IRN", name: "Mehdi Taremi", nameHe: "מהדי טארמי" },
  { team: "IRN", name: "Sardar Azmoun", nameHe: "סרדאר אזמון" },
  { team: "IRN", name: "Alireza Jahanbakhsh", nameHe: "אלירזא ג'הנבח'ש" },

  { team: "NZL", name: "Chris Wood", nameHe: "כריס ווד" },
  { team: "NZL", name: "Matthew Garbett", nameHe: "מתיו גרבט" },
  { team: "NZL", name: "Ben Waine", nameHe: "בן ויין" },

  // Group H — ESP, CPV, KSA, URU
  { team: "ESP", name: "Lamine Yamal", nameHe: "לאמין ימאל" },
  { team: "ESP", name: "Alvaro Morata", nameHe: "אלברו מוראטה" },
  { team: "ESP", name: "Nico Williams", nameHe: "ניקו וויליאמס" },
  { team: "ESP", name: "Dani Olmo", nameHe: "דני אולמו" },
  { team: "ESP", name: "Ferran Torres", nameHe: "פראן טורס" },

  { team: "CPV", name: "Garry Rodrigues", nameHe: "גארי רודריגז" },
  { team: "CPV", name: "Ryan Mendes", nameHe: "ראיין מנדס" },

  { team: "KSA", name: "Salem Al-Dawsari", nameHe: "סאלם אל-דוסרי" },
  { team: "KSA", name: "Firas Al-Buraikan", nameHe: "פיראס אל-בוריקאן" },
  { team: "KSA", name: "Abdullah Al-Hamdan", nameHe: "עבדאללה אל-חמדאן" },

  { team: "URU", name: "Darwin Nunez", nameHe: "דארווין נונייס" },
  { team: "URU", name: "Luis Suarez", nameHe: "לואיס סוארס" },
  { team: "URU", name: "Facundo Pellistri", nameHe: "פקונדו פליסטרי" },
  { team: "URU", name: "Agustin Canobbio", nameHe: "אגוסטין קנוביו" },

  // Group I — FRA, SEN, IRQ, NOR
  { team: "FRA", name: "Kylian Mbappe", nameHe: "קיליאן אמבפה" },
  { team: "FRA", name: "Antoine Griezmann", nameHe: "אנטואן גריזמן" },
  { team: "FRA", name: "Ousmane Dembele", nameHe: "אוסמאן דמבלה" },
  { team: "FRA", name: "Marcus Thuram", nameHe: "מרקוס תוראם" },
  { team: "FRA", name: "Randal Kolo Muani", nameHe: "רנדל קולו מואני" },

  { team: "SEN", name: "Sadio Mane", nameHe: "סדיו מאנה" },
  { team: "SEN", name: "Ismaila Sarr", nameHe: "איסמאילה סאר" },
  { team: "SEN", name: "Boulaye Dia", nameHe: "בולאיה דיה" },
  { team: "SEN", name: "Nicolas Jackson", nameHe: "ניקולא ג'קסון" },

  { team: "IRQ", name: "Aymen Hussein", nameHe: "איימן חוסיין" },
  { team: "IRQ", name: "Mohanad Ali", nameHe: "מוהנאד עלי" },
  { team: "IRQ", name: "Ali Al-Hamadi", nameHe: "עלי אל-חמאדי" },

  { team: "NOR", name: "Erling Haaland", nameHe: "ארלינג הולאנד" },
  { team: "NOR", name: "Martin Odegaard", nameHe: "מרטין אודגור" },
  { team: "NOR", name: "Alexander Sorloth", nameHe: "אלכסנדר סורלוט" },

  // Group J — ARG, ALG, AUT, JOR
  { team: "ARG", name: "Lionel Messi", nameHe: "ליאונל מסי" },
  { team: "ARG", name: "Julian Alvarez", nameHe: "חוליאן אלברס" },
  { team: "ARG", name: "Lautaro Martinez", nameHe: "לאוטארו מרטינס" },
  { team: "ARG", name: "Paulo Dybala", nameHe: "פאולו דיבאלה" },
  { team: "ARG", name: "Alejandro Garnacho", nameHe: "אלחנדרו גרנאצ'ו" },

  { team: "ALG", name: "Islam Slimani", nameHe: "איסלאם סלימאני" },
  { team: "ALG", name: "Said Benrahma", nameHe: "סעיד בנראחמה" },
  { team: "ALG", name: "Baghdad Bounedjah", nameHe: "בגדאד בונג'אח" },

  { team: "AUT", name: "Marko Arnautovic", nameHe: "מארקו ארנאוטוביץ'" },
  { team: "AUT", name: "Michael Gregoritsch", nameHe: "מיכאל גרגוריטש" },
  { team: "AUT", name: "Christoph Baumgartner", nameHe: "כריסטוף באומגרטנר" },

  { team: "JOR", name: "Mousa Al-Taamari", nameHe: "מוסא אל-תעמרי" },
  { team: "JOR", name: "Yazan Al-Naimat", nameHe: "יזן אל-נעימאת" },

  // Group K — POR, COD, UZB, COL
  { team: "POR", name: "Cristiano Ronaldo", nameHe: "כריסטיאנו רונאלדו" },
  { team: "POR", name: "Rafael Leao", nameHe: "רפאל לאאו" },
  { team: "POR", name: "Bernardo Silva", nameHe: "ברנרדו סילבה" },
  { team: "POR", name: "Bruno Fernandes", nameHe: "ברונו פרננדש" },
  { team: "POR", name: "Diogo Jota", nameHe: "דיוגו ז'וטה" },

  { team: "COD", name: "Cedric Bakambu", nameHe: "סדריק בקמבו" },
  { team: "COD", name: "Silas Katompa", nameHe: "סילאס קטומפה" },
  { team: "COD", name: "Fiston Mayele", nameHe: "פיסטון מאיילה" },

  { team: "UZB", name: "Eldor Shomurodov", nameHe: "אלדור שומורודוב" },
  { team: "UZB", name: "Abbosbek Fayzullaev", nameHe: "אבוסבק פאיזולאייב" },
  { team: "UZB", name: "Jaloliddin Masharipov", nameHe: "ג'לולדין משריפוב" },

  { team: "COL", name: "Luis Diaz", nameHe: "לואיס דיאס" },
  { team: "COL", name: "Rafael Santos Borre", nameHe: "רפאל סנטוס בורה" },
  { team: "COL", name: "Jhon Cordoba", nameHe: "ג'ון קורדובה" },
  { team: "COL", name: "Jhon Arias", nameHe: "ג'ון אריאס" },

  // Group L — ENG, CRO, GHA, PAN
  { team: "ENG", name: "Harry Kane", nameHe: "הארי קיין" },
  { team: "ENG", name: "Bukayo Saka", nameHe: "בוקאיו סאקה" },
  { team: "ENG", name: "Phil Foden", nameHe: "פיל פודן" },
  { team: "ENG", name: "Ollie Watkins", nameHe: "אולי ווטקינס" },
  { team: "ENG", name: "Cole Palmer", nameHe: "קול פאלמר" },

  { team: "CRO", name: "Andrej Kramaric", nameHe: "אנדריי קרמאריץ'" },
  { team: "CRO", name: "Bruno Petkovic", nameHe: "ברונו פטקוביץ'" },
  { team: "CRO", name: "Luka Modric", nameHe: "לוקה מודריץ'" },

  { team: "GHA", name: "Mohammed Kudus", nameHe: "מוחמד קודוס" },
  { team: "GHA", name: "Jordan Ayew", nameHe: "ג'ורדן איוו" },
  { team: "GHA", name: "Antoine Semenyo", nameHe: "אנטואן סמניו" },

  { team: "PAN", name: "Jose Fajardo", nameHe: "חוסה פחארדו" },
  { team: "PAN", name: "Cecilio Waterman", nameHe: "סיסיליו ווטרמן" },
  { team: "PAN", name: "Eduardo Guerrero", nameHe: "אדוארדו גררו" },
];
