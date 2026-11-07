import RateCard from "../models/RateCard.js";

const normalizeCourier = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeZone = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const isEffectiveOnDate = (rateCard, date) => {
  const effectiveFrom = new Date(rateCard.effectiveFrom);
  const effectiveTo = rateCard.effectiveTo
    ? new Date(rateCard.effectiveTo)
    : null;

  return effectiveFrom <= date && (!effectiveTo || effectiveTo >= date);
};

export const findApplicableRateCard = async ({
  workspaceId,
  courier,
  zone,
  shipmentDate,
}) => {
  const courierKey = normalizeCourier(courier);
  const normalizedZone = normalizeZone(zone);

  if (!courierKey || !normalizedZone || !shipmentDate) {
    return null;
  }

  const date = new Date(shipmentDate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return RateCard.findOne({
    workspaceId,
    courierKey,
    zone: normalizedZone,
    isActive: true,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
  })
    .sort({ effectiveFrom: -1, version: -1 })
    .lean();
};

/**
 * Loads rate cards for multiple freight records with one database query.
 * Selects the latest applicable card for each record in memory.
 */
export const findApplicableRateCards = async ({
  workspaceId,
  freightRecords = [],
}) => {
  const candidates = freightRecords
    .map((record) => {
      const data = record.standardizedData || {};
      const courierKey = normalizeCourier(data.courier);
      const zone = normalizeZone(data.zone);
      const shipmentDate = new Date(data.shipmentDate);

      if (
        !courierKey ||
        !zone ||
        !data.shipmentDate ||
        Number.isNaN(shipmentDate.getTime())
      ) {
        return null;
      }

      return {
        recordId: String(record._id),
        courierKey,
        zone,
        shipmentDate,
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) {
    return new Map();
  }

  const courierKeys = [...new Set(candidates.map((item) => item.courierKey))];

  const zones = [...new Set(candidates.map((item) => item.zone))];

  const latestShipmentDate = new Date(
    Math.max(...candidates.map((item) => item.shipmentDate.getTime())),
  );

  const rateCards = await RateCard.find({
    workspaceId,
    courierKey: { $in: courierKeys },
    zone: { $in: zones },
    isActive: true,
    effectiveFrom: { $lte: latestShipmentDate },
  })
    .sort({ effectiveFrom: -1, version: -1 })
    .lean();

  const rateCardsByCourierZone = new Map();

  for (const rateCard of rateCards) {
    const key = `${rateCard.courierKey}|${rateCard.zone}`;

    if (!rateCardsByCourierZone.has(key)) {
      rateCardsByCourierZone.set(key, []);
    }

    rateCardsByCourierZone.get(key).push(rateCard);
  }

  const result = new Map();

  for (const candidate of candidates) {
    const key = `${candidate.courierKey}|${candidate.zone}`;
    const matchingCards = rateCardsByCourierZone.get(key) || [];

    const applicableCard = matchingCards.find((rateCard) =>
      isEffectiveOnDate(rateCard, candidate.shipmentDate),
    );

    if (applicableCard) {
      result.set(candidate.recordId, applicableCard);
    }
  }

  return result;
};
