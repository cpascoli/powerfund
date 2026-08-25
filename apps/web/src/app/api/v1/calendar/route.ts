import {
  calendarMarkdown,
  listPublicCalendarEvents,
} from "@/lib/data/calendar";
import {
  CACHE_CATALOG,
  corsPreflight,
  handlePublicGet,
  jsonResponse,
  markdownResponse,
  wantsMarkdown,
} from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicGet(request, CACHE_CATALOG, async (remaining) => {
    const events = await listPublicCalendarEvents();
    if (wantsMarkdown(request)) {
      return markdownResponse(calendarMarkdown(events), {
        cacheControl: CACHE_CATALOG,
        remaining,
      });
    }
    return jsonResponse(
      {
        as_of: new Date().toISOString(),
        count: events.length,
        events,
      },
      { cacheControl: CACHE_CATALOG, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
