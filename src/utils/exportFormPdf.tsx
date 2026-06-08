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

// Latin glyphs — for numbers, dates, scores.
// Using a separate family avoids BiDi garbling that occurs when digits are
// placed inside Hebrew-subset font strings with a page-level direction:rtl.
Font.register({
  family: 'HeeboLatin',
  fonts: [
    { src: heeboLatinUrl, fontWeight: 'normal' },
    { src: heeboLatinBoldUrl, fontWeight: 'bold' },
  ],
});

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

  // ── Section / group headers ────────────────────────────────────────────────
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
  groupHeader: {
    fontFamily: 'Heebo',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.white,
    backgroundColor: C.primary,
    textAlign: 'right',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 2,
  },

  // ── Match rows ─────────────────────────────────────────────────────────────
  // row-reverse in LTR context: element[0] is rightmost, element[N-1] is leftmost
  // Layout (right → left): date | homeTeam | scoreView | awayTeam
  matchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 3,
    minHeight: 18,
  } as any,
  matchDate: {
    fontFamily: 'HeeboLatin',
    fontSize: 7,
    color: C.inkMuted,
    textAlign: 'right',
    width: 44,
  },
  matchTeam: {
    fontFamily: 'Heebo',
    fontSize: 8,
    color: C.ink,
    textAlign: 'right',
    flex: 1,
  },
  // Score is rendered as a View with three Text children (awayScore | : | homeScore)
  // in a LTR flexDirection:'row' so that:
  //   awayScore (element[0]) = leftmost → visually next to awayTeam (far left)
  //   homeScore (element[2]) = rightmost → visually next to homeTeam (right side)
  scoreView: {
    width: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
  scoreNum: {
    fontFamily: 'HeeboLatin',
    fontSize: 10,
    fontWeight: 'bold',
    color: C.ink,
    textAlign: 'center',
    width: 13,
  },
  scoreSep: {
    fontFamily: 'HeeboLatin',
    fontSize: 10,
    fontWeight: 'bold',
    color: C.inkMuted,
    textAlign: 'center',
    width: 6,
  },
  scoreDash: {
    fontFamily: 'HeeboLatin',
    fontSize: 10,
    color: C.inkMuted,
    textAlign: 'center',
    width: 42,
  },

  // ── Knockout advancing ─────────────────────────────────────────────────────
  matchAdvancing: {
    fontFamily: 'Heebo',
    fontSize: 7,
    color: C.primary,
    fontWeight: 'bold',
    textAlign: 'right',
    width: 62,
  },

  // ── Penalty note ───────────────────────────────────────────────────────────
  penaltyNote: {
    fontFamily: 'Heebo',
    fontSize: 7,
    color: C.inkMuted,
    textAlign: 'right',
    paddingRight: 44,
    marginBottom: 1,
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

const KO_ORDER = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function Score({ h, a }: { h: any; a: any }) {
  if (h == null || a == null) {
    return (
      <View style={styles.scoreView}>
        <Text style={styles.scoreDash}>-</Text>
      </View>
    );
  }
  // row-reverse match row: home is on the RIGHT, away on the LEFT.
  // scoreView uses flexDirection:'row' (LTR) so element[0]=leftmost.
  // We place awayScore first (left side, near awayTeam) and homeScore last (right side, near homeTeam).
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
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

const GROUPS_PER_PAGE = 4;

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

  // One page per GROUPS_PER_PAGE groups (single column)
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
                <Text style={styles.groupHeader}>בית {group}</Text>
                {matches.map((match: any) => {
                  const pred = matchPredictions[match.id];
                  const homeName =
                    (match.homeTeam ? getTeamByCode(match.homeTeam)?.name : null) ||
                    match.homeTeam ||
                    '?';
                  const awayName =
                    (match.awayTeam ? getTeamByCode(match.awayTeam)?.name : null) ||
                    match.awayTeam ||
                    '?';
                  const isTie =
                    pred?.homeScore != null &&
                    pred?.awayScore != null &&
                    Number(pred.homeScore) === Number(pred.awayScore) &&
                    !!pred?.advancingTeam;
                  return (
                    <View key={match.id}>
                      <View style={styles.matchRow}>
                        {/* row-reverse: element[0]=rightmost */}
                        <Text style={styles.matchDate}>{match.date || ''}</Text>
                        <Text style={styles.matchTeam}>{homeName}</Text>
                        <Score h={pred?.homeScore} a={pred?.awayScore} />
                        <Text style={styles.matchTeam}>{awayName}</Text>
                      </View>
                      {isTie ? (
                        <Text style={styles.penaltyNote}>
                          {`בעיטות הכרעה: ${
                            pred.advancingTeam
                              ? getTeamByCode(pred.advancingTeam)?.name ||
                                pred.advancingTeam
                              : ''
                          }`}
                        </Text>
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

      {/* ── KNOCKOUT STAGE PAGE ──────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionHeader}>שלב ההמשך</Text>
        {KO_ORDER.map((stage) => {
          const stageMatches = knockoutMatches.filter(
            (m: any) => m.stage === stage,
          );
          if (stageMatches.length === 0) return null;
          return (
            <View key={stage}>
              <Text style={styles.groupHeader}>
                {STAGES[stage as keyof typeof STAGES] || stage}
              </Text>
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
                const advancingName = pred?.advancingTeam
                  ? (getTeamByCode(pred.advancingTeam)?.name ||
                      pred.advancingTeam)
                  : '';

                return (
                  <View key={match.id}>
                    <View style={styles.matchRow}>
                      <Text style={styles.matchDate}>{match.date || ''}</Text>
                      <Text style={styles.matchTeam}>{homeName}</Text>
                      <Score h={pred?.homeScore} a={pred?.awayScore} />
                      <Text style={styles.matchTeam}>{awayName}</Text>
                      {advancingName ? (
                        <Text style={styles.matchAdvancing}>
                          {`עולה: ${advancingName}`}
                        </Text>
                      ) : null}
                    </View>
                    {isTie ? (
                      <Text style={styles.penaltyNote}>בעיטות הכרעה</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })}
        <PageFooter formName={formName} />
      </Page>

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
