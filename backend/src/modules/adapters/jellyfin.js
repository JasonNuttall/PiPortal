/**
 * Jellyfin adapter.
 *
 * Jellyfin cannot be modified to speak the portal contract, so the translation
 * lives here instead. It produces exactly the payload a native module would,
 * which is why nothing downstream — panels, views, caching, connection states —
 * needs to know the difference.
 *
 * Authenticates with an API key from Dashboard → Advanced → API Keys.
 */

const RECENT_LIMIT = 16;

/** Jellyfin still accepts the Emby token header in 10.11. */
const authHeaders = (token) => (token ? { "X-Emby-Token": token } : {});

/**
 * Poster art. Jellyfin serves item images without authentication, so the hub's
 * image proxy can fetch these directly; the tag keeps the URL stable per
 * artwork so caching does not serve a stale poster after a change.
 */
const posterUrl = (base, item) => {
  const tag = item.ImageTags?.Primary;
  if (!tag) return null;
  return `${base}/Items/${item.Id}/Images/Primary?maxHeight=450&tag=${tag}`;
};

const subtitleFor = (item) => {
  if (item.Type === "Series") {
    return item.ProductionYear ? `Series · ${item.ProductionYear}` : "Series";
  }
  return item.ProductionYear ? `Film · ${item.ProductionYear}` : "Film";
};

const jellyfin = {
  id: "jellyfin",
  label: "Jellyfin",

  /**
   * @param {object} ctx
   * @param {string} ctx.url - server base, e.g. http://jelly:8096
   * @param {string|null} ctx.token
   * @param {(path: string, options: object) => Promise<any>} ctx.request
   */
  async fetch({ url, token, request }) {
    const base = url.replace(/\/+$/, "");
    const headers = authHeaders(token);

    const get = (path) => request(`${base}${path}`, { headers });

    // Fetched together; a failure in one should not blank the whole panel.
    const [counts, sessions, recent] = await Promise.all([
      get("/Items/Counts").catch(() => null),
      get("/Sessions").catch(() => null),
      get(
        "/Items?Recursive=true&IncludeItemTypes=Movie,Series" +
          "&SortBy=DateCreated&SortOrder=Descending" +
          `&Limit=${RECENT_LIMIT}` +
          "&Fields=DateCreated,ProductionYear" +
          "&ImageTypeLimit=1&EnableImageTypes=Primary"
      ).catch(() => null),
    ]);

    if (!counts && !sessions && !recent) {
      throw new Error("Jellyfin did not answer; check the URL and API key");
    }

    const datasets = [];

    if (counts) {
      datasets.push({
        id: "movies",
        label: "Films",
        shape: "metric",
        value: counts.MovieCount ?? 0,
      });
      datasets.push({
        id: "series",
        label: "Series",
        shape: "metric",
        value: counts.SeriesCount ?? 0,
      });
    }

    if (Array.isArray(sessions)) {
      // Only sessions actually playing something are interesting.
      const playing = sessions.filter((session) => session.NowPlayingItem);
      datasets.push({
        id: "streams",
        label: "Now playing",
        shape: "metric",
        value: playing.length,
        tone: playing.length > 0 ? "ok" : null,
      });

      if (playing.length > 0) {
        datasets.push({
          id: "watching",
          label: "Streams",
          shape: "collection",
          suggests: "list",
          items: playing.map((session) => ({
            id: session.Id,
            title: session.NowPlayingItem.Name,
            subtitle: session.UserName,
            meta: session.DeviceName,
            image: posterUrl(base, session.NowPlayingItem),
            detail: [
              session.Client ? { label: "Client", value: session.Client } : null,
              session.NowPlayingItem.SeriesName
                ? { label: "Series", value: session.NowPlayingItem.SeriesName }
                : null,
            ].filter(Boolean),
          })),
        });
      }
    }

    if (recent?.Items?.length) {
      datasets.push({
        id: "recent",
        label: "Recently added",
        shape: "schedule",
        // Posters are the point of this one, so a grid rather than a calendar.
        suggests: "grid",
        // Jellyfin's listing is a most-recent-N, not a date range to page.
        window: false,
        items: recent.Items.map((item) => ({
          id: item.Id,
          title: item.SeriesName ? `${item.SeriesName}` : item.Name,
          subtitle: subtitleFor(item),
          date: item.DateCreated,
          image: posterUrl(base, item),
          href: `${base}/web/#/details?id=${item.Id}`,
          detail: [
            item.Type ? { label: "Type", value: item.Type } : null,
            item.ProductionYear
              ? { label: "Year", value: String(item.ProductionYear) }
              : null,
          ].filter(Boolean),
        })),
      });
    }

    return {
      contract: 1,
      id: "jellyfin",
      title: "Jellyfin",
      href: `${base}/web/`,
      status: counts ? "ok" : "warn",
      ttl: 120,
      datasets,
    };
  },
};

module.exports = jellyfin;
