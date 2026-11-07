const roundAmount = (value) => Number(value.toFixed(2));

const calculateExpectedFreight = ({
  billedWeight,
  zone,
  courier,
  shipmentDate,
  codAmount = null,
  isRto = false,
  rateCard,
}) => {
  const weight = Number(billedWeight);

  if (!Number.isFinite(weight) || weight <= 0) {
    return {
      status: "needs_review",
      reason: "Invalid billed weight",
    };
  }

  if (!rateCard) {
    return {
      status: "needs_review",
      reason: "No applicable courier rate card found",
    };
  }

  const normalizedZone = String(zone || "")
    .trim()
    .toUpperCase();
  const normalizedCourier = String(courier || "")
    .trim()
    .toLowerCase();

  if (
    normalizedZone !== String(rateCard.zone).trim().toUpperCase() ||
    normalizedCourier !== String(rateCard.courierKey).trim().toLowerCase()
  ) {
    return {
      status: "needs_review",
      reason: "Courier or zone does not match the rate card",
    };
  }

  const date = new Date(shipmentDate);

  if (!shipmentDate || Number.isNaN(date.getTime())) {
    return {
      status: "needs_review",
      reason: "Shipment date is missing or invalid",
    };
  }

  if (
    date < new Date(rateCard.effectiveFrom) ||
    (rateCard.effectiveTo && date > new Date(rateCard.effectiveTo))
  ) {
    return {
      status: "needs_review",
      reason: "Rate card is not effective for the shipment date",
    };
  }

  if (!rateCard.isActive) {
    return {
      status: "needs_review",
      reason: "Rate card is inactive",
    };
  }

  const slabs = [...(rateCard.weightSlabs || [])].sort(
    (a, b) => a.minWeight - b.minWeight,
  );

  const slabIndex = slabs.findIndex((slab, index) => {
    const isLastSlab = index === slabs.length - 1;

    return (
      weight >= slab.minWeight &&
      (weight < slab.maxWeight || (isLastSlab && weight <= slab.maxWeight))
    );
  });

  if (slabIndex === -1) {
    return {
      status: "needs_review",
      reason: "No weight slab matches the billed weight",
    };
  }

  const slab = slabs[slabIndex];
  const extraWeight = Math.max(0, weight - slab.minWeight);

  const baseFreight =
    slab.baseCharge + extraWeight * slab.additionalChargePerKg;

  // A COD fee applies only when a COD amount is supplied.
  const hasCodAmount =
    codAmount !== null && codAmount !== undefined && codAmount !== "";

  let codValue = null;

  if (hasCodAmount) {
    codValue = Number(codAmount);

    if (!Number.isFinite(codValue) || codValue < 0) {
      return {
        status: "needs_review",
        reason: "COD amount is invalid",
      };
    }
  }

  const codFee = hasCodAmount ? Number(rateCard.codFee || 0) : 0;
  const codPercentage = Number(rateCard.codFeePercentage || 0);

  let percentageCodFee = 0;

  if (hasCodAmount && codPercentage > 0) {
    percentageCodFee = (codValue * codPercentage) / 100;
  }

  const rtoFee = isRto ? Number(rateCard.rtoFee || 0) : 0;
  const additionalCharges = Number(rateCard.additionalCharges || 0);

  const expectedAmount = roundAmount(
    baseFreight + codFee + percentageCodFee + rtoFee + additionalCharges,
  );

  return {
    status: "calculated",
    expectedAmount,
    breakdown: {
      baseFreight: roundAmount(baseFreight),
      codFee: roundAmount(codFee),
      percentageCodFee: roundAmount(percentageCodFee),
      rtoFee: roundAmount(rtoFee),
      additionalCharges: roundAmount(additionalCharges),
    },
    rateCardVersion: rateCard.version,
  };
};

const compareFreightAmounts = (
  expectedAmount,
  actualAmount,
  tolerance = 10,
) => {
  const expected = Number(expectedAmount);
  const actual = Number(actualAmount);

  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    return {
      status: "needs_review",
      difference: null,
    };
  }

  const difference = roundAmount(actual - expected);

  if (Math.abs(difference) <= tolerance) {
    return {
      status: "settled",
      difference,
    };
  }

  if (difference > tolerance) {
    return {
      status: "freight_overcharged",
      difference,
    };
  }

  return {
    status: "needs_review",
    difference,
    reason: "Actual freight is lower than expected",
  };
};

export { calculateExpectedFreight, compareFreightAmounts };
