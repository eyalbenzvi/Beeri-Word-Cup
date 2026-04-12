// Top scorer candidates for FIFA 2026 World Cup
// 3-5 key forwards/attacking players per team
export const TOP_SCORER_PLAYERS = [
  // Group A — MEX, RSA, KOR, CZE
  { team: "MEX", name: "Santiago Gimenez" },
  { team: "MEX", name: "Raul Jimenez" },
  { team: "MEX", name: "Hirving Lozano" },
  { team: "MEX", name: "Alexis Vega" },

  { team: "RSA", name: "Percy Tau" },
  { team: "RSA", name: "Lyle Foster" },
  { team: "RSA", name: "Themba Zwane" },

  { team: "KOR", name: "Son Heung-min" },
  { team: "KOR", name: "Hwang Hee-chan" },
  { team: "KOR", name: "Lee Kang-in" },
  { team: "KOR", name: "Cho Gue-sung" },

  { team: "CZE", name: "Patrik Schick" },
  { team: "CZE", name: "Adam Hlozek" },
  { team: "CZE", name: "Mojmir Chytil" },

  // Group B — CAN, BIH, QAT, SUI
  { team: "CAN", name: "Jonathan David" },
  { team: "CAN", name: "Alphonso Davies" },
  { team: "CAN", name: "Cyle Larin" },
  { team: "CAN", name: "Tajon Buchanan" },

  { team: "BIH", name: "Edin Dzeko" },
  { team: "BIH", name: "Ermedin Demirovic" },
  { team: "BIH", name: "Smail Prevljak" },

  { team: "QAT", name: "Akram Afif" },
  { team: "QAT", name: "Almoez Ali" },
  { team: "QAT", name: "Hassan Al-Haydos" },

  { team: "SUI", name: "Breel Embolo" },
  { team: "SUI", name: "Noah Okafor" },
  { team: "SUI", name: "Ruben Vargas" },
  { team: "SUI", name: "Zeki Amdouni" },

  // Group C — BRA, MAR, HAI, SCO
  { team: "BRA", name: "Vinicius Junior" },
  { team: "BRA", name: "Rodrygo" },
  { team: "BRA", name: "Raphinha" },
  { team: "BRA", name: "Endrick" },
  { team: "BRA", name: "Savinho" },

  { team: "MAR", name: "Youssef En-Nesyri" },
  { team: "MAR", name: "Hakim Ziyech" },
  { team: "MAR", name: "Sofiane Boufal" },
  { team: "MAR", name: "Brahim Diaz" },

  { team: "HAI", name: "Frantzdy Pierrot" },
  { team: "HAI", name: "Duckens Nazon" },

  { team: "SCO", name: "Che Adams" },
  { team: "SCO", name: "Lyndon Dykes" },
  { team: "SCO", name: "Lawrence Shankland" },

  // Group D — USA, PAR, AUS, TUR
  { team: "USA", name: "Christian Pulisic" },
  { team: "USA", name: "Folarin Balogun" },
  { team: "USA", name: "Timothy Weah" },
  { team: "USA", name: "Gio Reyna" },
  { team: "USA", name: "Ricardo Pepi" },

  { team: "PAR", name: "Miguel Almiron" },
  { team: "PAR", name: "Julio Enciso" },
  { team: "PAR", name: "Adam Bareiro" },

  { team: "AUS", name: "Mathew Leckie" },
  { team: "AUS", name: "Mitchell Duke" },
  { team: "AUS", name: "Craig Goodwin" },

  { team: "TUR", name: "Kerem Akturkoglu" },
  { team: "TUR", name: "Arda Guler" },
  { team: "TUR", name: "Baris Alper Yilmaz" },
  { team: "TUR", name: "Yusuf Yazici" },

  // Group E — GER, ECU, CIV, CUR
  { team: "GER", name: "Kai Havertz" },
  { team: "GER", name: "Florian Wirtz" },
  { team: "GER", name: "Jamal Musiala" },
  { team: "GER", name: "Leroy Sane" },
  { team: "GER", name: "Niclas Fullkrug" },

  { team: "ECU", name: "Enner Valencia" },
  { team: "ECU", name: "Kevin Rodriguez" },
  { team: "ECU", name: "Gonzalo Plata" },

  { team: "CIV", name: "Sebastien Haller" },
  { team: "CIV", name: "Nicolas Pepe" },
  { team: "CIV", name: "Simon Adingra" },

  { team: "CUR", name: "Rangelo Janga" },
  { team: "CUR", name: "Kenji Gorre" },

  // Group F — NED, JPN, SWE, TUN
  { team: "NED", name: "Cody Gakpo" },
  { team: "NED", name: "Memphis Depay" },
  { team: "NED", name: "Xavi Simons" },
  { team: "NED", name: "Brian Brobbey" },

  { team: "JPN", name: "Takumi Minamino" },
  { team: "JPN", name: "Kaoru Mitoma" },
  { team: "JPN", name: "Daichi Kamada" },
  { team: "JPN", name: "Kyogo Furuhashi" },

  { team: "SWE", name: "Alexander Isak" },
  { team: "SWE", name: "Viktor Gyokeres" },
  { team: "SWE", name: "Dejan Kulusevski" },
  { team: "SWE", name: "Anthony Elanga" },

  { team: "TUN", name: "Youssef Msakni" },
  { team: "TUN", name: "Aissa Laidouni" },
  { team: "TUN", name: "Seifeddine Jaziri" },

  // Group G — BEL, EGY, IRN, NZL
  { team: "BEL", name: "Romelu Lukaku" },
  { team: "BEL", name: "Jeremy Doku" },
  { team: "BEL", name: "Lois Openda" },
  { team: "BEL", name: "Johan Bakayoko" },

  { team: "EGY", name: "Mohamed Salah" },
  { team: "EGY", name: "Omar Marmoush" },
  { team: "EGY", name: "Mostafa Mohamed" },
  { team: "EGY", name: "Trezeguet" },

  { team: "IRN", name: "Mehdi Taremi" },
  { team: "IRN", name: "Sardar Azmoun" },
  { team: "IRN", name: "Alireza Jahanbakhsh" },

  { team: "NZL", name: "Chris Wood" },
  { team: "NZL", name: "Matthew Garbett" },
  { team: "NZL", name: "Ben Waine" },

  // Group H — ESP, CPV, KSA, URU
  { team: "ESP", name: "Lamine Yamal" },
  { team: "ESP", name: "Alvaro Morata" },
  { team: "ESP", name: "Nico Williams" },
  { team: "ESP", name: "Dani Olmo" },
  { team: "ESP", name: "Ferran Torres" },

  { team: "CPV", name: "Garry Rodrigues" },
  { team: "CPV", name: "Ryan Mendes" },

  { team: "KSA", name: "Salem Al-Dawsari" },
  { team: "KSA", name: "Firas Al-Buraikan" },
  { team: "KSA", name: "Abdullah Al-Hamdan" },

  { team: "URU", name: "Darwin Nunez" },
  { team: "URU", name: "Luis Suarez" },
  { team: "URU", name: "Facundo Pellistri" },
  { team: "URU", name: "Agustin Canobbio" },

  // Group I — FRA, SEN, IRQ, NOR
  { team: "FRA", name: "Kylian Mbappe" },
  { team: "FRA", name: "Antoine Griezmann" },
  { team: "FRA", name: "Ousmane Dembele" },
  { team: "FRA", name: "Marcus Thuram" },
  { team: "FRA", name: "Randal Kolo Muani" },

  { team: "SEN", name: "Sadio Mane" },
  { team: "SEN", name: "Ismaila Sarr" },
  { team: "SEN", name: "Boulaye Dia" },
  { team: "SEN", name: "Nicolas Jackson" },

  { team: "IRQ", name: "Aymen Hussein" },
  { team: "IRQ", name: "Mohanad Ali" },
  { team: "IRQ", name: "Ali Al-Hamadi" },

  { team: "NOR", name: "Erling Haaland" },
  { team: "NOR", name: "Martin Odegaard" },
  { team: "NOR", name: "Alexander Sorloth" },

  // Group J — ARG, ALG, AUT, JOR
  { team: "ARG", name: "Lionel Messi" },
  { team: "ARG", name: "Julian Alvarez" },
  { team: "ARG", name: "Lautaro Martinez" },
  { team: "ARG", name: "Paulo Dybala" },
  { team: "ARG", name: "Alejandro Garnacho" },

  { team: "ALG", name: "Islam Slimani" },
  { team: "ALG", name: "Said Benrahma" },
  { team: "ALG", name: "Baghdad Bounedjah" },

  { team: "AUT", name: "Marko Arnautovic" },
  { team: "AUT", name: "Michael Gregoritsch" },
  { team: "AUT", name: "Christoph Baumgartner" },

  { team: "JOR", name: "Mousa Al-Taamari" },
  { team: "JOR", name: "Yazan Al-Naimat" },

  // Group K — POR, COD, UZB, COL
  { team: "POR", name: "Cristiano Ronaldo" },
  { team: "POR", name: "Rafael Leao" },
  { team: "POR", name: "Bernardo Silva" },
  { team: "POR", name: "Bruno Fernandes" },
  { team: "POR", name: "Diogo Jota" },

  { team: "COD", name: "Cedric Bakambu" },
  { team: "COD", name: "Silas Katompa" },
  { team: "COD", name: "Fiston Mayele" },

  { team: "UZB", name: "Eldor Shomurodov" },
  { team: "UZB", name: "Abbosbek Fayzullaev" },
  { team: "UZB", name: "Jaloliddin Masharipov" },

  { team: "COL", name: "Luis Diaz" },
  { team: "COL", name: "Rafael Santos Borre" },
  { team: "COL", name: "Jhon Cordoba" },
  { team: "COL", name: "Jhon Arias" },

  // Group L — ENG, CRO, GHA, PAN
  { team: "ENG", name: "Harry Kane" },
  { team: "ENG", name: "Bukayo Saka" },
  { team: "ENG", name: "Phil Foden" },
  { team: "ENG", name: "Ollie Watkins" },
  { team: "ENG", name: "Cole Palmer" },

  { team: "CRO", name: "Andrej Kramaric" },
  { team: "CRO", name: "Bruno Petkovic" },
  { team: "CRO", name: "Luka Modric" },

  { team: "GHA", name: "Mohammed Kudus" },
  { team: "GHA", name: "Jordan Ayew" },
  { team: "GHA", name: "Antoine Semenyo" },

  { team: "PAN", name: "Jose Fajardo" },
  { team: "PAN", name: "Cecilio Waterman" },
  { team: "PAN", name: "Eduardo Guerrero" },
];
