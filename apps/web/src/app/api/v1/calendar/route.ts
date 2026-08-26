import {
  calendarMarkdown,
  calendarPastMarkdown,
  listCompletedCalendarEvents,
  listPublicCalendarEvents,
  parseCalendarView,
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
    const view = parseCalendarView(new URL(request.url).searchParams.get("view") ?? undefined);
    if (view === "past") {
      const events = await listCompletedCalendarEvents();
      if (wantsMarkdown(request)) {
        return markdownResponse(calendarPastMarkdown(events), {
          cacheControl: CACHE_CATALOG,
          remaining,
        });
      }
      return jsonResponse(
        {
          as_of: new Date().toISOString(),
          view,
          count: events.length,
          events,
        },
        { cacheControl: CACHE_CATALOG, remaining },
      );
    }

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
        view,
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
