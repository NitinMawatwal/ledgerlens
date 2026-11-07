const AMOUNT_TOLERANCE = 10;

const compareAmounts = (
  expectedAmount,
  actualAmount,
  tolerance = AMOUNT_TOLERANCE,
) => {
  const expected = Number(expectedAmount);
  const actual = Number(actualAmount);

  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    return {
      status: "needs_review",
      difference: null,
    };
  }

  const difference = Number((expected - actual).toFixed(2));

  if (Math.abs(difference) <= tolerance) {
    return {
      status: "settled",
      difference,
    };
  }

  if (difference > tolerance) {
    return {
      status: "short_paid",
      difference,
    };
  }

  return {
    status: "needs_review",
    difference,
    reason: "Actual amount exceeds expected amount",
  };
};

const checkUnpaidPastDue = (
  actualAmount,
  dueDate,
  currentDate = new Date(),
) => {
  const actual = Number(actualAmount);

  if (!Number.isFinite(actual) || !dueDate) {
    return false;
  }

  return actual === 0 && new Date(dueDate) < currentDate;
};

const checkFreightOvercharge = (
  expectedFreight,
  actualFreight,
  tolerance = AMOUNT_TOLERANCE,
) => {
  const expected = Number(expectedFreight);
  const actual = Number(actualFreight);

  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    return {
      isOvercharged: false,
      difference: null,
    };
  }

  const difference = Number((actual - expected).toFixed(2));

  return {
    isOvercharged: difference > tolerance,
    difference,
  };
};

const checkReturnNotReceived = ({ isReturnExpected, warehouseReceivedAt }) => {
  return isReturnExpected === true && !warehouseReceivedAt;
};

export {
  AMOUNT_TOLERANCE,
  compareAmounts,
  checkUnpaidPastDue,
  checkFreightOvercharge,
  checkReturnNotReceived,
};
