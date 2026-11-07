const AMOUNT_TOLERANCE = 10;

const toAmount = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const roundAmount = (value) => Number(value.toFixed(2));

const sumField = (records, field) => {
  let total = 0;

  for (const record of records) {
    const amount = toAmount(record.standardizedData?.[field]);

    if (amount === null) return null;

    total += amount;
  }

  return roundAmount(total);
};

const calculateSettlement = (settlements = []) => {
  if (!settlements.length) {
    return {
      expectedAmount: null,
      actualAmount: 0,
      difference: null,
      tcs: 0,
      tds: 0,
      status: "needs_review",
      reason: "No settlement records found",
    };
  }

  let expectedAmount = 0;
  let actualAmount = 0;
  let tcs = 0;
  let tds = 0;

  for (const record of settlements) {
    const data = record.standardizedData || {};

    const gross = toAmount(data.grossAmount);
    const commission = toAmount(data.commission);
    const shipping = toAmount(data.shippingFee);
    const otherFees = toAmount(data.otherFees);
    const refund = toAmount(data.refundAmount);
    const taxCollected = toAmount(data.tcs);
    const taxDeducted = toAmount(data.tds);
    const net = toAmount(data.netAmount);

    if (
      [
        gross,
        commission,
        shipping,
        otherFees,
        refund,
        taxCollected,
        taxDeducted,
        net,
      ].some((value) => value === null)
    ) {
      return {
        expectedAmount: null,
        actualAmount: null,
        difference: null,
        tcs: null,
        tds: null,
        status: "needs_review",
        reason: "Invalid settlement amount",
      };
    }

    expectedAmount +=
      gross -
      commission -
      shipping -
      otherFees -
      refund -
      taxCollected -
      taxDeducted;

    actualAmount += net;
    tcs += taxCollected;
    tds += taxDeducted;
  }

  expectedAmount = roundAmount(expectedAmount);
  actualAmount = roundAmount(actualAmount);

  const difference = roundAmount(expectedAmount - actualAmount);

  return {
    expectedAmount,
    actualAmount,
    difference,
    tcs: roundAmount(tcs),
    tds: roundAmount(tds),
    status:
      Math.abs(difference) <= AMOUNT_TOLERANCE
        ? "settled"
        : difference > AMOUNT_TOLERANCE
          ? "short_paid"
          : "needs_review",
  };
};

const calculateCOD = (codRecords = []) => {
  if (!codRecords.length) {
    return {
      expectedAmount: null,
      actualAmount: 0,
      difference: null,
      status: "needs_review",
      reason: "No COD records found",
    };
  }

  let expectedAmount = 0;
  let actualAmount = 0;

  for (const record of codRecords) {
    const data = record.standardizedData || {};

    const collected = toAmount(data.codCollectedAmount);
    const deductions = toAmount(data.deductions);
    const remitted = toAmount(data.remittedAmount);

    if ([collected, deductions, remitted].some((value) => value === null)) {
      return {
        expectedAmount: null,
        actualAmount: null,
        difference: null,
        status: "needs_review",
        reason: "Invalid COD amount",
      };
    }

    expectedAmount += collected - deductions;
    actualAmount += remitted;
  }

  expectedAmount = roundAmount(expectedAmount);
  actualAmount = roundAmount(actualAmount);

  const difference = roundAmount(expectedAmount - actualAmount);

  return {
    expectedAmount,
    actualAmount,
    difference,
    status:
      Math.abs(difference) <= AMOUNT_TOLERANCE
        ? "settled"
        : difference > AMOUNT_TOLERANCE
          ? "short_paid"
          : "needs_review",
  };
};

const calculateFreight = (freightRecords = []) => {
  if (!freightRecords.length) {
    return {
      expectedAmount: null,
      actualAmount: 0,
      difference: null,
      status: "needs_review",
      reason: "No freight records available",
    };
  }

  const actualAmount = sumField(freightRecords, "totalFreight");

  if (actualAmount === null) {
    return {
      expectedAmount: null,
      actualAmount: null,
      difference: null,
      status: "needs_review",
      reason: "Invalid freight amount",
    };
  }

  return {
    expectedAmount: null,
    actualAmount,
    difference: null,
    status: "needs_review",
    reason: "Courier rate-card calculation is pending",
  };
};

const calculateReturnStatus = (returnRecords = []) => {
  if (!returnRecords.length) {
    return {
      status: "not_applicable",
      warehouseReceivedAt: null,
    };
  }

  const receivedRecord = returnRecords.find(
    (record) => record.standardizedData?.warehouseReceivedAt,
  );

  if (receivedRecord) {
    return {
      status: "received",
      warehouseReceivedAt: receivedRecord.standardizedData.warehouseReceivedAt,
    };
  }

  return {
    status: "not_received",
    warehouseReceivedAt: null,
  };
};

export {
  AMOUNT_TOLERANCE,
  toAmount,
  calculateSettlement,
  calculateCOD,
  calculateFreight,
  calculateReturnStatus,
};
