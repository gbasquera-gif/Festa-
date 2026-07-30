import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@festae/database";
import { ANALYTICS_FUNNEL_ORDER } from "@festae/shared";
import type { TrackEventInput } from "@festae/shared";

const SUMMARY_WINDOW_DAYS = 30;

@Injectable()
export class AnalyticsService {
  track(input: TrackEventInput) {
    return prisma.analyticsEvent.create({
      data: {
        type: input.type,
        userId: input.userId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async summary() {
    const since = new Date();
    since.setDate(since.getDate() - SUMMARY_WINDOW_DAYS);

    const grouped = await prisma.analyticsEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    const countByType = new Map(grouped.map((row) => [row.type, row._count._all]));

    const funnel = ANALYTICS_FUNNEL_ORDER.map((type) => ({
      type,
      count: countByType.get(type) ?? 0,
    }));

    const funnelWithDropoff = funnel.map((step, index) => {
      const previous = index === 0 ? null : funnel[index - 1].count;
      const dropoffRate =
        previous && previous > 0 ? Math.round((1 - step.count / previous) * 1000) / 10 : null;
      return { ...step, dropoffRate };
    });

    return {
      windowDays: SUMMARY_WINDOW_DAYS,
      totalEvents: grouped.reduce((sum, row) => sum + row._count._all, 0),
      byType: Object.fromEntries(countByType),
      funnel: funnelWithDropoff,
    };
  }
}
