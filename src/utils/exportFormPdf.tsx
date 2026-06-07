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

Font.register({
  family: 'Heebo',
  fonts: [
    { src: heeboRegularUrl, fontWeight: 'normal' },
    { src: heeboBoldUrl, fontWeight: 'bold' },
  ],
});

const COLORS = {
  primary: '#58CC02',
  primarySoft: '#F0FFE4',
  ink: '#1C1B1F',
  inkMuted: '#6B7280',
  border: '#E5E7EB',
  white: '#FFFFFF',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Heebo',
    direction: 'rtl',
    paddingHorizontal: 30,
    paddingVertical: 24,
    backgroundColor: COLORS.white,
  },
  coverHeader: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 30,
    marginHorizontal: -30,
    marginTop: -24,
    marginBottom: 20,
  },
  coverTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'right',
    fontFamily: 'Heebo',
  },
  coverSubtitle: {
    fontSize: 10,
    color: COLORS.white,
    textAlign: 'right',
    marginTop: 4,
    fontFamily: 'Heebo',
  },
  summaryBox: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 16,
  } as any,
  summaryItem: {
    flex: 1,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 8,
    padding: 10,
    alignItems: 'flex-end',
  } as any,
  summaryLabel: {
    fontSize: 8,
    color: COLORS.inkMuted,
    fontFamily: 'Heebo',
    textAlign: 'right',
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.ink,
    fontFamily: 'Heebo',
    textAlign: 'right',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'right',
    fontFamily: 'Heebo',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 3,
    marginBottom: 8,
    marginTop: 16,
  },
  groupHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white,
    backgroundColor: COLORS.primary,
    padding: 4,
    textAlign: 'right',
    fontFamily: 'Heebo',
    borderRadius: 4,
    marginBottom: 2,
    marginTop: 8,
  },
  matchRow: {
    flexDirection: 'row-reverse',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 3,
    alignItems: 'center',
  } as any,
  matchDate: {
    width: 50,
    fontSize: 7,
    color: COLORS.inkMuted,
    textAlign: 'right',
    fontFamily: 'Heebo',
  },
  matchTeam: {
    flex: 1,
    fontSize: 8,
    color: COLORS.ink,
    textAlign: 'right',
    fontFamily: 'Heebo',
  },
  matchScore: {
    width: 35,
    fontSize: 9,
    fontWeight: 'bold',
    color: COLORS.ink,
    textAlign: 'center',
    fontFamily: 'Heebo',
  },
  matchAdvancing: {
    width: 60,
    fontSize: 7,
    color: COLORS.inkMuted,
    textAlign: 'right',
    fontFamily: 'Heebo',
  },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 30,
    right: 30,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  } as any,
  footerText: {
    fontSize: 7,
    color: COLORS.inkMuted,
    fontFamily: 'Heebo',
  },
  twoColumns: {
    flexDirection: 'row-reverse',
    gap: 12,
  } as any,
  column: {
    flex: 1,
  },
  penaltyNote: {
    fontSize: 7,
    color: COLORS.inkMuted,
    textAlign: 'right',
    fontFamily: 'Heebo',
    marginTop: 1,
    paddingRight: 4,
  },
});

const KO_ORDER = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'] as const;

function scoreStr(h: any, a: any): string {
  if (h == null || a == null) return '—';
  return `${h}:${a}`;
}

function PdfDocument({
  form,
  userName,
}: {
  form: any;
  userName?: string;
}) {
  const matchPredictions = form.matches || {};
  const bracketTeams = getCachedBracket(matchPredictions);
  const championCode = getCachedChampion(matchPredictions);
  const groupKeys = Object.keys(GROUPS);

  const submittedDate = form.submittedAt
    ? new Date(form.submittedAt).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'לא ידוע';

  const championName = championCode
    ? (getTeamByCode(championCode)?.name || championCode)
    : 'לא נקבע';

  // Split groups into pairs for 2-column layout
  const groupPairs: string[][] = [];
  for (let i = 0; i < groupKeys.length; i += 2) {
    groupPairs.push(groupKeys.slice(i, i + 2));
  }

  return (
    <Document>
      {/* ── COVER PAGE ─────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.coverHeader}>
          <Text style={styles.coverTitle}>
            {(form.formName || 'ניחושים').slice(0, 40)}
          </Text>
          <Text style={styles.coverSubtitle}>מונדיאל 2026 — ניחושים אישיים</Text>
          {userName ? (
            <Text style={styles.coverSubtitle}>{userName}</Text>
          ) : null}
          <Text style={styles.coverSubtitle}>הוגש: {submittedDate}</Text>
        </View>

        <View style={styles.summaryBox}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>אלופה</Text>
            <Text style={styles.summaryValue}>{championName}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>מלך שערים</Text>
            <Text style={styles.summaryValue}>
              {form.topScorer || 'לא הוכנס'}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>תקציב</Text>
            <Text style={styles.summaryValue}>{form.budgetNumber || '—'}</Text>
          </View>
        </View>

        <View fixed style={styles.footer}>
          <Text style={styles.footerText}>{form.formName || ''}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `עמוד ${pageNumber} מתוך ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* ── GROUP STAGE PAGES — 2 groups per page ──────────────────────── */}
      {groupPairs.map((pair, pairIdx) => (
        <Page key={pairIdx} size="A4" style={styles.page}>
          <Text style={styles.sectionHeader}>שלב הבתים</Text>
          <View style={styles.twoColumns}>
            {pair.map((group) => {
              const matches = groupMatches.filter(
                (m: any) => m.group === group,
              );
              return (
                <View key={group} style={styles.column}>
                  <Text style={styles.groupHeader}>בית {group}</Text>
                  {matches.map((match: any) => {
                    const pred = matchPredictions[match.id];
                    const homeTeam = match.homeTeam
                      ? getTeamByCode(match.homeTeam)
                      : null;
                    const awayTeam = match.awayTeam
                      ? getTeamByCode(match.awayTeam)
                      : null;
                    const isTie =
                      pred?.homeScore != null &&
                      pred?.awayScore != null &&
                      Number(pred.homeScore) === Number(pred.awayScore) &&
                      !!pred?.advancingTeam;
                    return (
                      <View key={match.id}>
                        <View style={styles.matchRow}>
                          <Text style={styles.matchDate}>
                            {match.date || ''}
                          </Text>
                          <Text style={styles.matchTeam}>
                            {homeTeam?.name || match.homeTeam || '?'}
                          </Text>
                          <Text style={styles.matchScore}>
                            {scoreStr(pred?.homeScore, pred?.awayScore)}
                          </Text>
                          <Text style={styles.matchTeam}>
                            {awayTeam?.name || match.awayTeam || '?'}
                          </Text>
                        </View>
                        {isTie ? (
                          <Text style={styles.penaltyNote}>
                            בעיטות הכרעה:{' '}
                            {pred.advancingTeam
                              ? getTeamByCode(pred.advancingTeam)?.name ||
                                pred.advancingTeam
                              : ''}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
          <View fixed style={styles.footer}>
            <Text style={styles.footerText}>{form.formName || ''}</Text>
            <Text
              style={styles.footerText}
              render={({ pageNumber, totalPages }) =>
                `עמוד ${pageNumber} מתוך ${totalPages}`
              }
            />
          </View>
        </Page>
      ))}

      {/* ── KNOCKOUT STAGE PAGE ─────────────────────────────────────────── */}
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
                {STAGES[stage as keyof typeof STAGES]}
              </Text>
              {stageMatches.map((match: any) => {
                const pred = matchPredictions[match.id];
                const stageTeamEntry = bracketTeams?.[match.id];
                const homeCode = stageTeamEntry?.home || null;
                const awayCode = stageTeamEntry?.away || null;
                const homeName = homeCode
                  ? (getTeamByCode(homeCode)?.name || homeCode)
                  : 'טרם נקבע';
                const awayName = awayCode
                  ? (getTeamByCode(awayCode)?.name || awayCode)
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
                      <Text style={styles.matchScore}>
                        {scoreStr(pred?.homeScore, pred?.awayScore)}
                      </Text>
                      <Text style={styles.matchTeam}>{awayName}</Text>
                      <Text
                        style={[styles.matchAdvancing, { fontWeight: 'bold' }]}
                      >
                        {advancingName ? `עולה: ${advancingName}` : ''}
                      </Text>
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
        <View fixed style={styles.footer}>
          <Text style={styles.footerText}>{form.formName || ''}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `עמוד ${pageNumber} מתוך ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function exportToPdf(
  form: any,
  userName?: string,
): Promise<void> {
  // pdf() returns a renderer instance; toBlob() returns a Promise<Blob>
  const blob = await pdf(
    <PdfDocument form={form} userName={userName} />,
  ).toBlob();

  const url = URL.createObjectURL(blob);

  // iOS Safari ignores a.download on blob URLs — open inline in PDF viewer instead.
  // The user can then save via the system share sheet.
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
