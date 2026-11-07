const normalizeOrderId = (value) => {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim().toLowerCase();

  return normalized || null;
};

const groupRecordsByOrderId = (records = []) => {
  const grouped = new Map();

  for (const record of records) {
    const orderId = normalizeOrderId(record.standardizedData?.orderId);

    if (!orderId) continue;

    if (!grouped.has(orderId)) {
      grouped.set(orderId, []);
    }

    grouped.get(orderId).push(record);
  }

  return grouped;
};

const sumAmount = (records = [], field) => {
  return records.reduce((total, record) => {
    const value = Number(record.standardizedData?.[field]);

    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
};

const matchRecordsToOrders = ({
  orders = [],
  settlements = [],
  codRecords = [],
  freightRecords = [],
  returns = [],
}) => {
  const settlementGroups = groupRecordsByOrderId(settlements);
  const codGroups = groupRecordsByOrderId(codRecords);
  const freightGroups = groupRecordsByOrderId(freightRecords);
  const returnGroups = groupRecordsByOrderId(returns);

  return orders.map((order) => {
    const orderId = normalizeOrderId(order.standardizedData?.orderId);

    const matchedSettlements = orderId
      ? settlementGroups.get(orderId) || []
      : [];

    const matchedCodRecords = orderId ? codGroups.get(orderId) || [] : [];

    const matchedFreightRecords = orderId
      ? freightGroups.get(orderId) || []
      : [];

    const matchedReturns = orderId ? returnGroups.get(orderId) || [] : [];

    return {
      orderRecordId: order._id,
      orderId: order.standardizedData?.orderId || null,

      settlementRecordIds: matchedSettlements.map((record) => record._id),

      codRecordIds: matchedCodRecords.map((record) => record._id),

      freightRecordIds: matchedFreightRecords.map((record) => record._id),

      returnRecordIds: matchedReturns.map((record) => record._id),

      actualSettlementAmount: sumAmount(matchedSettlements, "netAmount"),

      actualCodAmount: sumAmount(matchedCodRecords, "remittedAmount"),

      actualFreightAmount: sumAmount(matchedFreightRecords, "totalFreight"),

      matched: {
        settlement: matchedSettlements.length > 0,
        cod: matchedCodRecords.length > 0,
        freight: matchedFreightRecords.length > 0,
        returns: matchedReturns.length > 0,
      },
    };
  });
};

export {
  normalizeOrderId,
  groupRecordsByOrderId,
  sumAmount,
  matchRecordsToOrders,
};
