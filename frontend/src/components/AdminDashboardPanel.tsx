import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  RiGraduationCapFill,
  RiUserStarFill,
  RiFilmFill,
  RiCertificateFill,
  RiMoreFill,
  RiArrowDownSLine,
} from "@remixicon/react";
import { api } from "../lib/api";
import { useLanguage } from "../lib/language-context";
import { Avatar } from "./Avatar";
import { RankBadge, type RankTier } from "./RankBadge";
import { AreaChart, DonutChart } from "./Charts";
import { ACTIVITIES, dayLabel } from "./AdminReportsPanel";
import "../styles/admin-dashboard.css";

export type DashboardPeriod = 7 | 30 | 90;
export const DASHBOARD_PERIODS: DashboardPeriod[] = [7, 30, 90];

type Person = {
  id: number;
  username: string;
  displayName: string;
  avatarKey: string;
  avatarUrl: string | null;
  grade: number | null;
};
type Dashboard = {
  days: number;
  totals: {
    students: number;
    teachers: number;
    videos: number;
    certificates: number;
  };
  daily: { day: string; xp: number }[];
  xpByActivity: { activity: string; xp: number }[];
  newest: (Person & {
    role: "student" | "teacher" | "admin";
    points: number;
    createdAt: string;
  })[];
  top: (Person & { totalXp: number; rankTier: RankTier })[];
};

/** The period picker in the page header: a button-shaped native select, so it works with a keyboard and on a phone for free. */
export function DashboardPeriodSelect({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (days: DashboardPeriod) => void;
}) {
  const { t } = useLanguage();
  return (
    <label className="dash-period btn btn-primary">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as DashboardPeriod)}
        aria-label={t("admin.dashPeriodLabel")}
      >
        {DASHBOARD_PERIODS.map((d) => (
          <option key={d} value={d}>
            {t(`admin.dashPeriod${d}`)}
          </option>
        ))}
      </select>
      <RiArrowDownSLine size={22} aria-hidden="true" />
    </label>
  );
}

function PanelHead({
  title,
  to,
  moreLabel,
}: {
  title: string;
  to: string;
  moreLabel: string;
}) {
  return (
    <div className="dash-head">
      <h2>{title}</h2>
      <Link
        to={to}
        className="dash-more"
        aria-label={moreLabel}
        title={moreLabel}
      >
        <RiMoreFill size={20} />
      </Link>
    </div>
  );
}

const STATS = [
  {
    key: "students",
    labelKey: "admin.dashStudents",
    Icon: RiGraduationCapFill,
    color: "var(--viz-5)",
  },
  {
    key: "teachers",
    labelKey: "admin.dashTeachers",
    Icon: RiUserStarFill,
    color: "var(--viz-4)",
  },
  {
    key: "videos",
    labelKey: "admin.dashVideos",
    Icon: RiFilmFill,
    color: "var(--viz-1)",
  },
  {
    key: "certificates",
    labelKey: "admin.dashCertificates",
    Icon: RiCertificateFill,
    color: "var(--viz-5)",
  },
] as const;

const ROLE_KEY = {
  student: "admin.roleStudentOption",
  teacher: "admin.roleTeacherOption",
  admin: "admin.roleAdminOption",
} as const;

/** The admin's first page: counts, points over time and by source, the newest accounts and the top students. */
export function AdminDashboardPanel({ days }: { days: DashboardPeriod }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);

  // The old numbers stay on screen while a new period loads, so switching it doesn't blank the page.
  useEffect(() => {
    let cancelled = false;
    api
      .get<Dashboard>(`/admin/dashboard?days=${days}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!data) {
    return failed ? (
      <div className="form-error-banner">{t("admin.dashLoadError")}</div>
    ) : (
      <div className="empty-state">
        <div className="spinner" />
      </div>
    );
  }

  const locale = lang === "ar" ? "ar-QA" : "en-US";
  const number = new Intl.NumberFormat("en-US"); // Latin digits, like every other count in the app
  const joined = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const sources = data.xpByActivity.map((a) => ({
    key: a.activity,
    label: t((ACTIVITIES[a.activity] ?? ACTIVITIES.other).labelKey),
    value: a.xp,
    color: (ACTIVITIES[a.activity] ?? ACTIVITIES.other).color,
  }));

  return (
    <div className="dash-box">
      <div className="dash">
        {failed && (
          <div className="form-error-banner dash-wide">
            {t("admin.dashLoadError")}
          </div>
        )}

        <div className="dash-stats dash-wide">
          {STATS.map(({ key, labelKey, Icon, color }) => (
            <div
              key={key}
              className="card dash-stat"
              style={{ "--tone": color } as React.CSSProperties}
            >
              <span className="dash-stat-icon" aria-hidden="true">
                <Icon size={24} />
              </span>
              <div>
                <div className="dash-stat-value">
                  {number.format(data.totals[key])}
                </div>
                <div className="dash-stat-label">{t(labelKey)}</div>
              </div>
            </div>
          ))}
        </div>

        <section className="card dash-reports">
          <PanelHead
            title={t("admin.dashPointsTitle")}
            to="/admin/reports"
            moreLabel={t("admin.dashOpenReports")}
          />
          <AreaChart
            labels={data.daily.map((d) => dayLabel(d.day, lang))}
            values={data.daily.map((d) => d.xp)}
            format={(v) => number.format(Math.round(v))}
            ariaLabel={t("admin.dashPointsTitle")}
          />
        </section>

        <section className="card dash-analytics">
          <PanelHead
            title={t("admin.dashSourcesTitle")}
            to="/admin/reports"
            moreLabel={t("admin.dashOpenReports")}
          />
          {sources.length > 0 ? (
            <DonutChart
              slices={sources}
              unit={t("admin.dashPointsUnit")}
              ariaLabel={t("admin.dashSourcesTitle")}
              stacked
            />
          ) : (
            <p className="muted dash-empty">{t("admin.dashSourcesEmpty")}</p>
          )}
        </section>

        <section className="card dash-recent">
          <PanelHead
            title={t("admin.dashNewestTitle")}
            to="/admin/users"
            moreLabel={t("admin.dashOpenUsers")}
          />
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>{t("admin.dashColName")}</th>
                  <th>{t("admin.dashColRole")}</th>
                  <th>{t("admin.dashColGrade")}</th>
                  <th>{t("admin.dashColJoined")}</th>
                  <th className="num">{t("admin.dashColPoints")}</th>
                </tr>
              </thead>
              <tbody>
                {data.newest.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="dash-who">
                        <Avatar
                          avatarKey={u.avatarKey}
                          photoUrl={u.avatarUrl}
                          size={34}
                          square
                        />
                        <span>
                          <strong>{u.displayName}</strong>
                          <small dir="ltr">@{u.username}</small>
                        </span>
                      </span>
                    </td>
                    <td>{t(ROLE_KEY[u.role])}</td>
                    <td>
                      {u.grade ? (
                        <span className="dash-pill">
                          {t("admin.dashGrade", { n: u.grade })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {joined.format(
                        new Date(u.createdAt.replace(" ", "T") + "Z"),
                      )}
                    </td>
                    <td className="num">
                      {u.role === "admin" ? "—" : number.format(u.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card dash-top">
          <PanelHead
            title={t("admin.dashTopTitle")}
            to="/admin/users"
            moreLabel={t("admin.dashOpenUsers")}
          />
          {data.top.length === 0 && (
            <p className="muted dash-empty">{t("admin.dashTopEmpty")}</p>
          )}
          <ol className="dash-top-list">
            {data.top.map((u) => (
              <li key={u.id}>
                <span className="dash-top-pic">
                  <Avatar
                    avatarKey={u.avatarKey}
                    photoUrl={u.avatarUrl}
                    size={72}
                    square
                  />
                </span>
                <div>
                  <strong>{u.displayName}</strong>
                  <RankBadge tier={u.rankTier} size={22} />
                  <span className="muted">
                    {t("admin.dashPoints", { n: number.format(u.totalXp) })}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
