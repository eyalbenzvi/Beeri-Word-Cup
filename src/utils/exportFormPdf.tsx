import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';
import { getCachedBracket, getCachedChampion } from './bracketCache';
import { groupMatches, knockoutMatches, STAGES } from '../data/matches';
import { GROUPS, getTeamByCode } from '../data/teams';
// @ts-ignore — Vite treats .woff as a static asset and returns a hashed URL
import heeboRegularUrl from '@fontsource/heebo/files/heebo-hebrew-400-normal.woff';
// @ts-ignore
import heeboBoldUrl from '@fontsource/heebo/files/heebo-hebrew-700-normal.woff';
// @ts-ignore — Latin subset: covers digits, colons, slashes used in scores/dates
import heeboLatinUrl from '@fontsource/heebo/files/heebo-latin-400-normal.woff';
// @ts-ignore
import heeboLatinBoldUrl from '@fontsource/heebo/files/heebo-latin-700-normal.woff';

// Hebrew glyphs — for all Hebrew text
Font.register({
  family: 'Heebo',
  fonts: [
    { src: heeboRegularUrl, fontWeight: 'normal' },
    { src: heeboBoldUrl, fontWeight: 'bold' },
  ],
});

// Latin glyphs — for numbers, dates, scores, ASCII letters in labels.
// Using a separate family avoids BiDi garbling that occurs when digits are
// placed inside Hebrew-subset font strings with a page-level direction:rtl.
Font.register({
  family: 'HeeboLatin',
  fonts: [
    { src: heeboLatinUrl, fontWeight: 'normal' },
    { src: heeboLatinBoldUrl, fontWeight: 'bold' },
  ],
});

// Prevent @react-pdf/renderer from breaking team names at apostrophes
// ("צ'כיה", "אלג'ריה" etc.)
Font.registerHyphenationCallback((word) => [word]);

const C = {
  primary: '#58CC02',
  primaryDark: '#46A302',
  primarySoft: '#F0FFE4',
  ink: '#3C3C3C',
  inkMuted: '#5E5E5E',
  border: '#E5E5E5',
  borderStrong: '#D0D0D0',
  white: '#FFFFFF',
  bg: '#F7F7F7',
};

// Convert "Jun 11" / "Jul 1" → "11/06" / "01/07" (all digits, HeeboLatin-safe)
const MONTH_NUM: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};
function formatDate(d: string): string {
  const parts = d.split(' ');
  return parts.length === 2
    ? `${parts[1].padStart(2, '0')}/${MONTH_NUM[parts[0]] ?? '??'}`
    : d;
}

// NOTE: No direction:'rtl' on the page — it runs the Unicode BiDi algorithm
// over every string, which garbles mixed Hebrew+number text when the Hebrew
// font subset does not map digits. Layout direction is controlled explicitly
// via flexDirection:'row-reverse' and textAlign:'right' on each element.
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Heebo',
    paddingTop: 0,
    paddingBottom: 36,
    paddingHorizontal: 28,
    backgroundColor: C.white,
  },

  // ── Cover ──────────────────────────────────────────────────────────────────
  coverBand: {
    backgroundColor: C.primary,
    paddingVertical: 20,
    paddingHorizontal: 28,
    marginHorizontal: -28,
    marginBottom: 18,
  },
  coverTitle: {
    fontFamily: 'Heebo',
    fontSize: 24,
    fontWeight: 'bold',
    color: C.white,
    textAlign: 'right',
  },
  coverSub: {
    fontFamily: 'Heebo',
    fontSize: 10,
    color: C.white,
    textAlign: 'right',
    marginTop: 3,
    opacity: 0.9,
  },
  coverSubLatin: {
    fontFamily: 'HeeboLatin',
    fontSize: 10,
    color: C.white,
    textAlign: 'right',
    marginTop: 3,
    opacity: 0.9,
  },

  // ── Summary cards ──────────────────────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 18,
  } as any,
  summaryCard: {
    flex: 1,
    backgroundColor: C.primarySoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.primary,
    padding: 10,
    alignItems: 'flex-end',
  } as any,
  summaryLabel: {
    fontFamily: 'Heebo',
    fontSize: 8,
    color: C.inkMuted,
    textAlign: 'right',
    marginBottom: 2,
  },
  summaryValue: {
    fontFamily: 'Heebo',
    fontSize: 12,
    fontWeight: 'bold',
    color: C.ink,
    textAlign: 'right',
  },

  // ── Section header ─────────────────────────────────────────────────────────
  sectionHeader: {
    fontFamily: 'Heebo',
    fontSize: 13,
    fontWeight: 'bold',
    color: C.primary,
    textAlign: 'right',
    borderBottomWidth: 2,
    borderBottomColor: C.primary,
    paddingBottom: 3,
    marginBottom: 6,
    marginTop: 14,
  },

  // ── Group / stage header badge ─────────────────────────────────────────────
  // Container View — green pill. row-reverse so parts render right-to-left.
  groupHeaderView: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: C.primary,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 2,
    paddingVertical: 3,
    paddingHorizontal: 6,
  } as any,
  // Text inside the badge — font assigned per-part (Heebo vs HeeboLatin).
  groupHeaderPart: {
    fontSize: 9,
    fontWeight: 'bold',
    color: C.white,
  },

  // ── Matchday separator within a group ─────────────────────────────────────
  matchdayRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 2,
  } as any,
  matchdayLabel: {
    fontFamily: 'Heebo',
    fontSize: 7,
    color: C.primary,
    fontWeight: 'bold',
  },

  // ── Match rows ─────────────────────────────────────────────────────────────
  // row-reverse in LTR context: element[0]=rightmost, element[N-1]=leftmost.
  // Layout (right→left): meta(date+time) | homeTeam | scoreBox | awayTeam [| advancing]
  matchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    minHeight: 30,
  } as any,

  // Meta column: date + time stacked vertically (rightmost element in row-reverse)
  matchMetaView: {
    width: 52,
    alignItems: 'flex-end',
    paddingRight: 4,
  } as any,
  matchMetaDate: {
    fontFamily: 'HeeboLatin',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.ink,
    textAlign: 'right',
  },
  matchMetaTime: {
    fontFamily: 'HeeboLatin',
    fontSize: 7,
    color: C.inkMuted,
    textAlign: 'right',
    marginTop: 1,
  },

  // Team names (flex:1 fills remaining space, right-aligned Hebrew text)
  matchTeam: {
    fontFamily: 'Heebo',
    fontSize: 9,
    color: C.ink,
    textAlign: 'right',
    flex: 1,
  },

  // Score box — prominent green-bordered pill with large bold numbers.
  // scoreView is LTR flex: element[0]=awayScore(left) → adjacent to awayTeam
  //                        element[2]=homeScore(right) → adjacent to homeTeam
  scoreView: {
    width: 56,
    height: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.primarySoft,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.primary,
    marginHorizontal: 4,
  } as any,
  scoreNum: {
    fontFamily: 'HeeboLatin',
    fontSize: 13,
    fontWeight: 'bold',
    color: C.ink,
    textAlign: 'center',
    width: 14,
  },
  scoreSep: {
    fontFamily: 'HeeboLatin',
    fontSize: 13,
    fontWeight: 'bold',
    color: C.primary,
    textAlign: 'center',
    width: 8,
  },
  scoreDash: {
    fontFamily: 'HeeboLatin',
    fontSize: 12,
    color: C.inkMuted,
    textAlign: 'center',
    width: 56,
  },

  // ── Knockout advancing — single Text node avoids two-paragraph BiDi garbling.
  // Width 85pt fits the longest Hebrew team names at 7pt bold.
  matchAdvancingView: {
    width: 85,
    alignItems: 'flex-end',
  } as any,
  matchAdvancingLabel: {
    fontFamily: 'Heebo',
    fontSize: 7,
    color: C.primary,
    fontWeight: 'bold',
    textAlign: 'right',
  },

  // ── Penalty note ───────────────────────────────────────────────────────────
  penaltyNoteView: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingRight: 52, // indent past the meta column
    marginBottom: 1,
  } as any,
  penaltyNoteText: {
    fontFamily: 'Heebo',
    fontSize: 7,
    color: C.inkMuted,
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 10,
    left: 28,
    right: 28,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 4,
  } as any,
  footerText: {
    fontFamily: 'Heebo',
    fontSize: 7,
    color: C.inkMuted,
  },
  footerNum: {
    fontFamily: 'HeeboLatin',
    fontSize: 7,
    color: C.inkMuted,
  },
});

// Knockout round grouping for pagination.
// R32 (16 matches) | R16+QF (12 matches) | SF+3RD+F (4 matches)
type KoStage = 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'F';
const KO_PAGES: KoStage[][] = [
  ['R32'],
  ['R16', 'QF'],
  ['SF', '3RD', 'F'],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Split a label string into runs requiring Heebo (Hebrew) vs HeeboLatin (ASCII).
// Prevents tofu boxes when ASCII letters/digits appear in a Hebrew-subset font —
// e.g. "בית A" → ["בית ", Heebo] + ["A", HeeboLatin].
function splitForFonts(text: string): Array<{ t: string; latin: boolean }> {
  const result: Array<{ t: string; latin: boolean }> = [];
  let cur = '';
  let curLatin: boolean | null = null;
  for (const ch of text) {
    const latin = /[A-Za-z0-9\-/:]/.test(ch);
    if (curLatin === null || latin === curLatin) {
      cur += ch;
      curLatin = latin;
    } else {
      result.push({ t: cur, latin: curLatin });
      cur = ch;
      curLatin = latin;
    }
  }
  if (cur) result.push({ t: cur, latin: curLatin! });
  return result;
}

// Green pill badge — renders each Hebrew/Latin run with the correct font.
function HeaderLabel({ label }: { label: string }) {
  const parts = splitForFonts(label);
  return (
    <View style={styles.groupHeaderView}>
      {parts.map((part, i) => (
        <Text
          key={i}
          style={[
            styles.groupHeaderPart,
            { fontFamily: part.latin ? 'HeeboLatin' : 'Heebo' },
          ]}
        >
          {part.t}
        </Text>
      ))}
    </View>
  );
}

// Matchday sub-header shown when matchday changes within a group.
// Digit rendered in HeeboLatin to avoid tofu in Hebrew-subset font.
function MatchdayLabel({ day }: { day: number }) {
  return (
    <View style={styles.matchdayRow}>
      <Text style={styles.matchdayLabel}>מחזור </Text>
      <Text style={[styles.matchdayLabel, { fontFamily: 'HeeboLatin' }]}>
        {String(day)}
      </Text>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Score({ h, a }: { h: any; a: any }) {
  if (h == null || a == null) {
    return (
      <View style={styles.scoreView}>
        <Text style={styles.scoreDash}>-</Text>
      </View>
    );
  }
  // scoreView is LTR: element[0]=left → awayScore, element[2]=right → homeScore.
  // In the row-reverse matchRow, awayScore sits adjacent to awayTeam (far left)
  // and homeScore sits adjacent to homeTeam (right side). Correct per-team association.
  return (
    <View style={styles.scoreView}>
      <Text style={styles.scoreNum}>{a}</Text>
      <Text style={styles.scoreSep}>:</Text>
      <Text style={styles.scoreNum}>{h}</Text>
    </View>
  );
}

function PageFooter({ formName }: { formName: string }) {
  return (
    <View fixed style={styles.footer}>
      <Text style={styles.footerText}>{formName}</Text>
      <Text
        style={styles.footerNum}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

// 2 groups per page — 3 groups overflow A4 with matchday sub-headers included.
const GROUPS_PER_PAGE = 2;

function PdfDocument({ form, userName }: { form: any; userName?: string }) {
  const matchPredictions = form.matches || {};
  const bracketTeams = getCachedBracket(matchPredictions);
  const championCode = getCachedChampion(matchPredictions);
  const groupKeys = Object.keys(GROUPS);
  const formName = (form.formName || 'ניחושים').slice(0, 50);

  const submittedDate = form.submittedAt
    ? new Date(form.submittedAt).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  const championName = championCode
    ? (getTeamByCode(championCode)?.name || championCode)
    : 'לא נקבע';

  const groupPages: string[][] = [];
  for (let i = 0; i < groupKeys.length; i += GROUPS_PER_PAGE) {
    groupPages.push(groupKeys.slice(i, i + GROUPS_PER_PAGE));
  }

  return (
    <Document>

      {/* ── COVER PAGE ───────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.coverBand}>
          <Text style={styles.coverTitle}>{formName}</Text>
          <Text style={styles.coverSub}>ניחושים מונדיאל</Text>
          {userName ? <Text style={styles.coverSub}>{userName}</Text> : null}
          {submittedDate ? (
            <Text style={styles.coverSubLatin}>{submittedDate}</Text>
          ) : null}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>אלופה</Text>
            <Text style={styles.summaryValue}>{championName}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>מלך שערים</Text>
            <Text style={styles.summaryValue}>
              {form.topScorer || 'לא הוכנס'}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>תקציב</Text>
            <Text style={[styles.summaryValue, { fontFamily: 'HeeboLatin' }]}>
              {form.budgetNumber || '-'}
            </Text>
          </View>
        </View>

        <PageFooter formName={formName} />
      </Page>

      {/* ── GROUP STAGE PAGES — GROUPS_PER_PAGE groups per page ──────────── */}
      {groupPages.map((pageGroups, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          <Text style={styles.sectionHeader}>שלב הבתים</Text>

          {pageGroups.map((group) => {
            const matches = groupMatches.filter((m: any) => m.group === group);
            return (
              <View key={group}>
                {/* "בית A" — group letter is ASCII; HeaderLabel uses HeeboLatin for it */}
                <HeaderLabel label={`בית ${group}`} />

                {matches.map((match: any, matchIdx: number) => {
                  const pred = matchPredictions[match.id];
                  const homeName =
                    (match.homeTeam ? getTeamByCode(match.homeTeam)?.name : null) ||
                    match.homeTeam || '?';
                  const awayName =
                    (match.awayTeam ? getTeamByCode(match.awayTeam)?.name : null) ||
                    match.awayTeam || '?';
                  const isTie =
                    pred?.homeScore != null &&
                    pred?.awayScore != null &&
                    Number(pred.homeScore) === Number(pred.awayScore) &&
                    !!pred?.advancingTeam;
                  const showMatchday =
                    matchIdx === 0 ||
                    match.matchday !== matches[matchIdx - 1]?.matchday;

                  return (
                    <View key={match.id}>
                      {showMatchday && match.matchday != null ? (
                        <MatchdayLabel day={match.matchday} />
                      ) : null}
                      <View wrap={false} style={styles.matchRow}>
                        {/* row-reverse: element[0]=rightmost — date+time meta column */}
                        <View style={styles.matchMetaView}>
                          <Text style={styles.matchMetaDate}>
                            {formatDate(match.date || '')}
                          </Text>
                          {match.time ? (
                            <Text style={styles.matchMetaTime}>{match.time}</Text>
                          ) : null}
                        </View>
                        {/* U+200F (RLM) forces RTL paragraph direction, preventing
                            apostrophe in "צ'כיה" etc. from splitting the RTL run */}
                        <Text style={styles.matchTeam}>{'‏' + homeName}</Text>
                        <Score h={pred?.homeScore} a={pred?.awayScore} />
                        <Text style={styles.matchTeam}>{'‏' + awayName}</Text>
                      </View>
                      {isTie ? (
                        <View style={styles.penaltyNoteView}>
                          <Text style={styles.penaltyNoteText}>בעיטות הכרעה: </Text>
                          <Text style={styles.penaltyNoteText}>
                            {pred.advancingTeam
                              ? getTeamByCode(pred.advancingTeam)?.name || ''
                              : ''}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}

          <PageFooter formName={formName} />
        </Page>
      ))}

      {/* ── KNOCKOUT STAGE PAGES — one page per round group ──────────────── */}
      {KO_PAGES.map((pageRounds, pageIdx) => (
        <Page key={`ko-${pageIdx}`} size="A4" style={styles.page}>
          <Text style={styles.sectionHeader}>שלב ההמשך</Text>
          {pageRounds.map((stage) => {
            const stageMatches = knockoutMatches.filter(
              (m: any) => m.stage === stage,
            );
            if (stageMatches.length === 0) return null;
            return (
              <View key={stage}>
                {/* STAGES['R32'] = "שלב ה-32" — digits need HeeboLatin; HeaderLabel splits */}
                <HeaderLabel label={STAGES[stage] || stage} />
                {stageMatches.map((match: any) => {
                  const pred = matchPredictions[match.id];
                  const entry = bracketTeams?.[match.id];
                  const homeName = entry?.home
                    ? (getTeamByCode(entry.home)?.name || entry.home)
                    : 'טרם נקבע';
                  const awayName = entry?.away
                    ? (getTeamByCode(entry.away)?.name || entry.away)
                    : 'טרם נקבע';
                  const isTie =
                    pred?.homeScore != null &&
                    pred?.awayScore != null &&
                    Number(pred.homeScore) === Number(pred.awayScore) &&
                    !!pred?.advancingTeam;
                  // Drop Latin code fallback — Hebrew name only to avoid BiDi reordering
                  const advancingName = pred?.advancingTeam
                    ? (getTeamByCode(pred.advancingTeam)?.name || '')
                    : '';

                  return (
                    <View key={match.id}>
                      <View wrap={false} style={styles.matchRow}>
                        <View style={styles.matchMetaView}>
                          <Text style={styles.matchMetaDate}>
                            {formatDate(match.date || '')}
                          </Text>
                          {match.time ? (
                            <Text style={styles.matchMetaTime}>{match.time}</Text>
                          ) : null}
                        </View>
                        {/* U+200F (RLM) forces RTL paragraph direction */}
                        <Text style={styles.matchTeam}>{'‏' + homeName}</Text>
                        <Score h={pred?.homeScore} a={pred?.awayScore} />
                        <Text style={styles.matchTeam}>{'‏' + awayName}</Text>
                        {/* Single Text "עולה: name" avoids two-paragraph BiDi garbling.
                            85pt width fits longest team name at 7pt bold Heebo. */}
                        <View style={styles.matchAdvancingView}>
                          {advancingName ? (
                            <Text style={styles.matchAdvancingLabel}>
                              {'‏' + 'עולה: ' + advancingName}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {isTie ? (
                        <View style={styles.penaltyNoteView}>
                          <Text style={styles.penaltyNoteText}>בעיטות הכרעה</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
          <PageFooter formName={formName} />
        </Page>
      ))}

    </Document>
  );
}

// ── Export function ───────────────────────────────────────────────────────────

export async function exportToPdf(
  form: any,
  userName?: string,
): Promise<void> {
  const blob = await pdf(
    <PdfDocument form={form} userName={userName} />,
  ).toBlob();

  const url = URL.createObjectURL(blob);

  // iOS Safari ignores a.download on blob URLs — open inline so the user
  // can save via the system share sheet.
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  if (isIOS) {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = `ניחושים-${form.formId || 'form'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
