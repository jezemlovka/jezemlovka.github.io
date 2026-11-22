const KEYS = ["jzp", "dejvice"];
const MAX_AGE = 22 * 60 * 60 * 1000;
const CLOCK_SKEW = 10 * 60 * 1000;

export function resolveStatus(data, now = Date.now()) {
  const rows = data?.version === 1 && Array.isArray(data.bars) ? data.bars : [];
  const bars = KEYS.map((key) => {
    const row = rows.find((item) => item?.key === key);
    const time = Date.parse(row?.checked_at);
    const fresh = now - time <= MAX_AGE && time - now <= CLOCK_SKEW;
    const known = row?.status === "present" || row?.status === "absent";
    return {
      key,
      status: fresh && known ? row.status : "unknown",
      checkedAt: Number.isFinite(time) ? new Date(time) : null,
    };
  });
  let overall = "unknown";
  if (bars.some((bar) => bar.status === "present")) overall = "present";
  else if (bars.every((bar) => bar.status === "absent")) overall = "absent";
  return { overall, bars };
}
